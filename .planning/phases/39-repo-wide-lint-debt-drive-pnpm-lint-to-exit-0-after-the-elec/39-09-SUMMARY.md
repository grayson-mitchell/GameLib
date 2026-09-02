---
phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
plan: 09
subsystem: infra
tags: [eslint, lint, ratchet, ci, husky, package.json]

requires:
  - phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
    provides: "REQ-39-02 (repaired planning gates), REQ-39-03 (login-seam predicate collapse) — the final tree this plan measures"
provides:
  - "Post-collapse pnpm lint census: 0 errors, 4157 warnings, measured two independent ways in agreement"
  - "A mutation-proven --max-warnings 4157 ratchet in package.json's lint script, binding CI and .husky/pre-push"
  - "39-LINT-BASELINE.md documenting the measurement, the ratchet's provenance, and the recorded auto-fix-skip decision"
  - "REQ-39-01 marked Complete, closing all three Phase 39 requirements"
affects: [ci, lint, phase-39-closeout]

tech-stack:
  added: []
  patterns:
    - "Ratchet pattern for eslint --max-warnings: install in its own commit citing the measured N and sha, prove it fails at N-1 and passes at N before trusting it"

key-files:
  created:
    - .planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-LINT-BASELINE.md
  modified:
    - package.json
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Skipped the optional mechanically-safe eslint --fix auto-fix slice (Task 2) — post-collapse fixable (71) and unused-directive (69) counts were unchanged from the pre-collapse figures, ~1.7% of the 4157 total, and a repo-wide --fix's blast radius across src/** and meta/** wasn't worth the review risk for a requirement that never demanded the warning count shrink"
  - "Ratchet set to 4157, the freshly re-measured count on the exact commit the ratchet commit sits on, not reused from an earlier measurement in this plan"
  - "REQ-39-01 marked Complete in REQUIREMENTS.md (both the requirement bullet and the traceability table row) since its acceptance criteria — 0 errors, a mutation-proven ratchet in its own commit — genuinely hold"

patterns-established:
  - "A --max-warnings ratchet is not evidence of protection until proven to fail at N-1 and pass at N on the live tree, in commands recorded verbatim — configuring the flag alone is insufficient (T-39-40)"

requirements-completed: [REQ-39-01]

duration: 14min
completed: 2026-09-02
---

# Phase 39 Plan 09: Post-Collapse Lint Baseline and Ratchet Summary

**Re-measured `pnpm lint` against the final post-collapse tree at 0 errors / 4157 warnings (two independent measurement paths in agreement), installed and mutation-proved a `--max-warnings 4157` ratchet in its own commit, and closed REQ-39-01 — the last open requirement of Phase 39.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-02T03:10:13Z (measured from prior commit `fb8e44378`)
- **Completed:** 2026-09-02T03:22:46Z
- **Tasks:** 3 (Task 1 measure+document, Task 2 recorded skip, Task 3 ratchet+proof)
- **Files modified:** 3 (`package.json`, `39-LINT-BASELINE.md`, `.planning/REQUIREMENTS.md`)

## Accomplishments

- Verified REQ-39-01's substantive claim — `pnpm lint` exits 0, zero `severity === 2` findings — against the FINAL post-collapse tree (commit `fb8e44378`), not a pre-collapse snapshot, via two independent measurement paths that agreed exactly: 0 errors, 4157 warnings.
- Marked the ROADMAP's `53 errors, 3491 warnings` (2026-08-14) figure superseded for the second time, and recorded the 4190→4157 delta with its cause (REQ-39-03 collapse deletions), not just the number.
- Made a recorded, numbered decision to skip the optional mechanical auto-fix slice rather than silently omitting it.
- Installed a `--max-warnings 4157` ratchet in `package.json`'s `lint` script and proved it bites in both directions on the live tree (N-1 fails with eslint's own "too many warnings" message; N passes), landed in its own commit separate from the baseline document and the skip decision.
- Confirmed `python3 meta/runPlanningGates.py` still prints `7/7 planning gates passed.` after every change in this plan, including after the REQUIREMENTS.md edit.
- Closed REQ-39-01 in `.planning/REQUIREMENTS.md` (requirement bullet + traceability table), completing all three Phase 39 requirements.

## Task Commits

Each task was committed atomically, with explicit pathspecs:

1. **Task 1: Re-measure the post-collapse lint census and write the baseline document** — `9b351f433` (docs)
2. **Task 2: Record the decision to skip the mechanical auto-fix slice** — `142d85b73` (docs)
3. **Task 3: Install the `--max-warnings` ratchet and prove it bites** — `e981740324` (feat)

**Plan metadata:** `e90fcc0a6` (docs: mark REQ-39-01 complete)

_This plan had no TDD tasks; each commit corresponds 1:1 to a plan task, matching the plan's explicit commit-hygiene requirement that the ratchet never share a commit with anything that changes the warning count._

## Measured numbers (both paths, in agreement)

| Metric | Value |
|---|---|
| `pnpm lint` exit code | 0 |
| Errors (`severity === 2`) | 0 |
| Warnings (`severity === 1`) | 4157 |
| Delta from 2026-09-02 pre-collapse figure (4190) | -33, attributable to REQ-39-03's collapse plans |
| ROADMAP's 2026-08-14 figure (`53 errors, 3491 warnings`) | Superseded (marked explicitly in `39-LINT-BASELINE.md`) |
| Fixable-with-`--fix` findings | 71 (unchanged from pre-collapse) |
| Unused-directive (no-`ruleId`) findings | 69 (unchanged from pre-collapse) |
| Files linted | 1122 (plan's cited pre-collapse figure was 1121 — off by one, corrected here; immaterial to any acceptance criterion) |
| `python3 meta/runPlanningGates.py` | `7/7 planning gates passed.` (unchanged, re-verified after every commit in this plan) |

Full derivation, top-rules breakdown, and the test-vs-production warning split (2995 test / 1162 production) are recorded in `39-LINT-BASELINE.md`.

## Files Created/Modified

- `.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-LINT-BASELINE.md` - the post-collapse census, the Task 2 skip decision with its numbers, and the ratchet's provenance + mutation proof, built up across the three task commits
- `package.json` - `lint` script changed from `eslint --cache .` to `eslint --cache --max-warnings 4157 .`
- `.planning/REQUIREMENTS.md` - REQ-39-01 marked `[x]` Complete (requirement bullet + traceability table row), plus a closing "Last updated" note

## Decisions Made

- **Skip Task 2's auto-fix slice.** Post-collapse fixable (71) and unused-directive (69) counts matched the pre-collapse figures exactly — none of the 33 warnings that cleared during this phase's collapse plans lived in those two categories. At ~1.7% of the 4157 total, a repo-wide `eslint . --fix` (blast-radius-unknowable across `src/**` and `meta/**` per the plan's own frontmatter caveat) carried more review risk than the benefit justified, especially since REQ-39-01 never required the warning count to shrink — only to be measured and ratcheted.
- **Ratchet value 4157, re-measured fresh at Task 3 time**, not reused from Task 1's earlier measurement, per the plan's explicit instruction that "every earlier plan in this phase moved code" and the ratchet must cite a number nothing subsequently invalidates. It was unchanged (Task 2 touched no code), but the re-measurement was performed anyway to avoid trusting an earlier number by assumption.
- **REQ-39-01 marked Complete**, matching the style already used for REQ-39-02/-03's closures, since all of its stated acceptance criteria (0 errors verified on the final tree, a `--max-warnings N` ratchet proven to fail at `N-1`, landed in its own commit citing the number) are genuinely met and demonstrated with verbatim command output.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues were encountered. The plan's own optional Task 2 was legitimately exercised as a skip (a plan-sanctioned outcome, not a deviation), with the decision and its numbers recorded in `39-LINT-BASELINE.md`.

---

**Total deviations:** 0
**Impact on plan:** None. Plan executed as written, including its explicitly-optional Task 2 branch.

## Issues Encountered

None. Both measurement paths agreed exactly on the first attempt, so no `--cache`-staleness investigation was needed (`T-39-42`'s named risk did not materialize). The mutation proof's exit-code capture initially went through a `tail` pipe that masked `pnpm lint`'s real exit code (captured `tail`'s exit instead) — caught before it was recorded and redone with the exit code captured directly from the un-piped `pnpm lint` invocation, so the verbatim proof in `39-LINT-BASELINE.md` reflects the correct codes (1 at N-1, 0 at N).

## Backend suite (recorded, not a Task 3 acceptance criterion — this plan's changes are docs/config only)

`pnpm test --selectProjects Backend`: 3 failed suites / 187 passed / 190 total, 5 failed / 2 skipped / 4382 passed / 4389 total tests. All 3 failing suites are the pre-existing, previously-catalogued items in `deferred-items.md` (decompressPool native-vs-pure-js, downloadmanager/utils.test.ts i18n-namespace mismatch, enrichmentFlows.test.ts full-suite-load flake) — none touch any file this plan modified (`package.json`, `39-LINT-BASELINE.md`, `.planning/REQUIREMENTS.md`), and none are new. `pnpm codecheck` exits 0.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 39 is now closed at the requirement level: REQ-39-01, REQ-39-02, and REQ-39-03 are all Complete. `pnpm lint` exits 0 with a mutation-proven ratchet protecting the warning count from silent drift going forward. No blockers for closing out the phase folder itself (orchestrator's remaining housekeeping, not this plan's scope — STATE.md/ROADMAP.md updates are explicitly out of this plan's hands per the project-specific hard rules).
