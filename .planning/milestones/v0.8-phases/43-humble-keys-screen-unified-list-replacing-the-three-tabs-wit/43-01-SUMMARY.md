---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 01
subsystem: planning-records
tags: [requirements, roadmap, validation-strategy, nyquist, documentation]

# Dependency graph
requires:
  - phase: 42
    provides: "key_type presentation table, table-driven store indicator, exact-match auto-settle, Undo — all cited as the Depends-on basis for REQ-43-10/-11/-12"
provides:
  - "REQ-43-01..24 minted into .planning/REQUIREMENTS.md with a Phase 43 section and 24 Traceability rows"
  - "ROADMAP.md's Phase 43 section carries the real requirement range and all 10 plan entries with wave assignments"
  - "43-VALIDATION.md's Per-Task Verification Map is fully populated (24/24 requirements, real task IDs, nyquist_compliant: true)"
affects: [43-02, 43-03, 43-04, 43-05, 43-06, 43-07, 43-08, 43-09, 43-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Requirement text records planning-time corrections in-line (see key-decisions) rather than leaving them for a plan to rediscover"
    - "Per-Task Verification Map cites real plan/task IDs and positional jest test-paths with asserted counts, never -t-filtered patterns"

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-VALIDATION.md

key-decisions:
  - "selectKeysWaiting survives REQ-43-18's deletion scope — it has three production consumers outside the Humble Keys screen (StoreSearch, Discounts, plus two test files) that 43-RESEARCH.md and 43-PATTERNS.md incorrectly claimed were absent"
  - "compareWaiting must be exported (it is currently module-private) before REQ-43-05's unified list can sort with it"
  - "REQ-43-22's scope covers both meta/i18nGateScope.json AND meta/i18nForkTouchedFiles.json, not just the first — the second also enrols the four files this phase deletes"
  - "REQ-43-12/-17 require porting forward, not deleting, the Waiting/All tab tests' 22 lifecycle assertions the research predicted (wrongly) were already covered elsewhere"
  - "ROADMAP.md's Phase 43 goal text is superseded, not rewritten: shipped default sort is Expiring soonest (D-43-06) not Most recent, and the checkbox is Redeemable keys only with inverted polarity (D-43-08) not Hide redeemed keys"
  - "43-VALIDATION.md's three -t-filtered jest commands (compareWaiting/Redeemable/search) were measured this session to match zero tests and exit 0 — replaced with positional test-path commands asserting a test count"

requirements-completed: [REQ-43-01, REQ-43-02, REQ-43-03, REQ-43-04, REQ-43-05, REQ-43-06, REQ-43-07, REQ-43-08, REQ-43-09, REQ-43-10, REQ-43-11, REQ-43-12, REQ-43-13, REQ-43-14, REQ-43-15, REQ-43-16, REQ-43-17, REQ-43-18, REQ-43-19, REQ-43-20, REQ-43-21, REQ-43-22, REQ-43-23, REQ-43-24]

# Metrics
duration: 45min
completed: 2026-09-09
---

# Phase 43 Plan 01: Mint requirements and fill the validation contract Summary

**Adopted 43-RESEARCH.md's 24-requirement table verbatim into REQUIREMENTS.md, corrected ROADMAP.md's Phase 43 TBD line and empty plan list, and fully populated 43-VALIDATION.md's Per-Task Verification Map — all three planning records that every later plan in this phase set cites now carry real, PASS/FAIL-scoreable content instead of placeholders.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-09T18:05:00Z (approx.)
- **Completed:** 2026-09-09T18:50:29Z
- **Tasks:** 3/3 completed
- **Files modified:** 3

## Accomplishments

- `.planning/REQUIREMENTS.md` now defines REQ-43-01 through REQ-43-24 (24 bullets, 24 Traceability rows), each citing its source decision (D-43-01..D-43-21 or the UI-SPEC) and its verification method, plus a four-item "planning-time corrections" block recording measured facts that contradict the research/patterns docs.
- `.planning/ROADMAP.md`'s Phase 43 section now names the real requirement range and lists all 10 plans with their wave assignments, plus a recorded (not silent) deviation note where the shipped decisions (D-43-06, D-43-08) supersede the section's own original goal prose.
- `43-VALIDATION.md`'s Per-Task Verification Map went from 8 populated rows (all with `TBD` task IDs and three commands that match zero tests) to 24 rows, one per requirement, each citing a real plan+task ID, wave, and a positional jest command with an asserted test count. `nyquist_compliant` flipped to `true`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the REQ-43-01..24 section into REQUIREMENTS.md** - `13bfdabad` (docs)
2. **Task 2: Replace ROADMAP.md's Phase 43 TBD requirements line** - `f216c8b88` (docs)
3. **Task 3: Fill 43-VALIDATION.md's Per-Task Verification Map with real task IDs** - `7e6027721` (docs)

_No plan-metadata commit was made separately — this SUMMARY plus the STATE/ROADMAP update step is the final record, per this repo's standing prohibition on `gsd-sdk state.*`/`roadmap.*` verbs (they have corrupted STATE.md and ROADMAP.md before). No such verb was invoked at any point in this session; all edits were hand-authored, surgical `Edit` calls anchored on unique existing strings._

## Files Created/Modified

- `.planning/REQUIREMENTS.md` - Appended the `## Phase 43 Requirements` section (24 requirement bullets + provenance + 4 corrections) and 24 Traceability table rows
- `.planning/ROADMAP.md` - Replaced the Phase 43 `**Requirements**: TBD` line, the `**Plans:** 0 plans` stub, and the single `TBD` plan bullet with the real range and a 10-entry plan checklist; added a deliberate-deviations note
- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-VALIDATION.md` - Replaced all `TBD` Task ID/Plan/Wave cells and all `-t`-filtered commands in the Per-Task Verification Map; extended coverage from 8 to 24 requirements; resolved 2 of 5 "Known Gaps" and added a new lint-ceiling gap; flipped `nyquist_compliant` to `true`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a residual `-t "..."`-shaped substring from my own corrective prose**
- **Found during:** Task 3 self-verification
- **Issue:** The explanatory paragraph I added above the Per-Task Verification Map, while describing the three commands the seeded table got wrong, itself contained the literal substrings `-t "compareWaiting"` etc. — which the plan's own acceptance criterion (`grep -c ' -t "' returns 0`) treats as a violation regardless of context.
- **Fix:** Reworded the paragraph to name the filter patterns (`compareWaiting`, `Redeemable`, `search`) without reproducing the `-t "..."` command shape.
- **Files modified:** `43-VALIDATION.md`
- **Commit:** `7e6027721`

No other deviations. All three tasks executed exactly as the plan specified — the plan itself supplied the exact prose for the REQUIREMENTS.md corrections block and the ROADMAP.md deviation note, which were adopted near-verbatim.

## Known Stubs

None. This plan touches only `.planning/*.md` records; no application code, UI, or data path was created or modified, so no stub-detection scan applies.

## Threat Flags

None. This plan's own threat register (T-43-01, T-43-06, T-43-07, T-43-SC) is fully addressed by the plan's own constraints: no `gsd-sdk state.*`/`roadmap.*` verb was invoked, `STATE.md` was never touched, `git diff --stat` on `ROADMAP.md` showed 32 insertions / 3 deletions (well under the 20-deletion ceiling), and requirement texts were adopted verbatim from `43-RESEARCH.md` rather than re-derived. No new network endpoint, auth path, file-access pattern, or schema change was introduced.

## Self-Check: PASSED

- FOUND: `.planning/REQUIREMENTS.md` (modified, verified via grep counts: 24 bullets, 24 traceability rows, 24 unique REQ-43-* IDs)
- FOUND: `.planning/ROADMAP.md` (modified, verified via grep counts: 0 remaining `TBD` on the Phase 43 requirements line, 10 plan bullets, 1 "Redeemable keys only" mention)
- FOUND: `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-VALIDATION.md` (modified, verified via grep counts: 0 `TBD`, 0 `-t "`-filtered commands, 24 unique REQ-43-* IDs, `nyquist_compliant: true` present once, `SRC_CEILING` present)
- FOUND: commit `13bfdabad` in `git log --oneline`
- FOUND: commit `f216c8b88` in `git log --oneline`
- FOUND: commit `7e6027721` in `git log --oneline`
- CONFIRMED: `git diff --name-only` across all three task commits lists exactly `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `43-VALIDATION.md` — `.planning/STATE.md` is not among them
- CONFIRMED: no `gsd-sdk state.*` or `gsd-sdk roadmap.*` verb was invoked at any point in this session (grep of my own command history in this transcript would show none)

All claims verified. No missing items.
