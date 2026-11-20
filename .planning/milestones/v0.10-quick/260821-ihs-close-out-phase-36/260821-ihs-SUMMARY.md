---
quick_id: 260821-ihs
slug: close-out-phase-36
status: complete
date: 2026-08-21
subsystem: docs/planning
tags: [phase-close-out, bookkeeping, stale-record, meta-gates]

key-files:
  created:
    - .planning/quick/260821-ihs-close-out-phase-36/260821-ihs-PLAN.md
    - .planning/quick/260821-ihs-close-out-phase-36/260821-ihs-SUMMARY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md

key-decisions:
  - "The two meta/ failures were NOT re-fixed — they were already repaired at c53a8d419 and 5b7481b2e, and the gates were RUN (154/154) before the note was believed"
  - "Progress counters WERE moved this time (unlike the 23/23.1/23.2 close-outs) because phase 36 sits inside the v0.8 tracked range; the arithmetic is recorded as a comment in the progress block itself"
  - "36-VERIFICATION.md was NOT manufactured — the phase rests on 36-03's operator gate, and the missing artifact is recorded as owed"

metrics:
  duration: ~25min
  tasks: 3
  source_files_modified: 0
---

# Quick Task 260821-ihs: Close out Phase 36

## The finding: half the request was already done

The task as given was *fix the two `meta/` test failures, then close out phase 36*.
The first half turned out to be a no-op, and that is the more useful result.

`36/deferred-items.md` logs two failures found during 36-01's execution. Both were
already fixed by later commits, and neither fix was propagated back to the note:

| Reported failure | Actually fixed at |
|---|---|
| `genI18nGateScope.test.ts` — `i18nForkTouchedFiles.json` missing `Dialog.tsx` | `c53a8d419` `fix(meta): declare Dialog.tsx as i18n debt -- repair A-17 anti-rot` |
| `hardcodedStringGate.test.ts` — D-18 allowlist `expectedCount: 27` vs measured 26 | `5b7481b2e` `fix(meta): ratchet SteamLogin D-18 allowlist count 27 -> 26` |

Confirmed two ways, not one:

```
$ npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts
PASS Meta meta/__tests__/genI18nGateScope.test.ts
PASS Meta meta/__tests__/hardcodedStringGate.test.ts (8.791 s)
Test Suites: 2 passed, 2 total
Tests:       1 skipped, 154 passed, 155 total
```

and against the artifacts themselves — `meta/i18nForkTouchedFiles.json:12` carries
`src/frontend/components/UI/Dialog/components/Dialog.tsx`, and
`meta/i18nGateAllowlist.json:4` records `expectedCount: 26`.

`deferred-items.md` is left unedited: it is phase 36's historical record of what the
executor saw at the time, and rewriting it would erase that. The resolution is recorded
here and in STATE.md instead.

This is the [[blocker-records-rot-silently]] pattern for the second time in this repo —
a `deferred`/`blocked_by` record kept asserting a failure that later commits had already
repaired. It cost nothing here only because the gates were executed before being trusted.

**No source file, and nothing under `meta/`, was modified by this task.**

## What was actually done

### Task 1 — `.planning/ROADMAP.md`

- §36 heading gained the strong marker `— ✅ COMPLETE 2026-08-21`. Strong wording is
  load-bearing: the explorer extension parses the marker and discards prose
  ([[explorer-phase-colour-needs-a-strong-marker]]).
- All three `- [ ] 36-0N-PLAN.md` boxes ticked.
- Added an **Outcome (2026-08-21)** paragraph: the 10/10 gate and its fresh-build
  discipline, the overlay conversion, the guard replacing the unmount mitigation for
  T-34.4.2-39/-41, Task 4's designed-RED-then-rewritten sequence, the two routed
  cosmetic defects, and what remains owed.

Diff: 27 insertions / 4 deletions — 1 heading, 3 checkboxes, 23 added lines.

### Task 2 — `.planning/REQUIREMENTS.md`

REQ-36-02 and REQ-36-03 were deliberately left unticked at plan time *pending plan
36-03's live gate*. That gate ran and passed, so both now tick, and the trailing prose
was rewritten from the pending condition to the discharge:

- **REQ-36-02** — discharged by live items 5/7/9 (other five tiles genuinely dead; guard
  releases on both close and success).
- **REQ-36-03** — discharged by live items 1/2/3 (motion, overlap, painted background —
  all invisible to a `testEnvironment: 'node'` source gate).

REQ-36-01/-04/-05 were already ticked. `grep -c '^- \[x\] \*\*REQ-36-'` now returns **5**.
Diff: exactly 2 lines.

### Task 3 — `.planning/STATE.md`

- `status: planned` → `status: ready_to_plan`
- `stopped_at:` rewritten as a genuine completion record opening `PHASE 36 COMPLETE — ✅`,
  with the entire prior text retained verbatim behind `Prior: `
- `last_updated:` and `last_activity:` refreshed (prior value retained behind `Prior: `)
- One row appended to the **Quick Tasks Completed** table (4-column format — this was not
  a `--validate` run, so no Status column)
- Progress counters moved — see below

### Deviation from plan: progress counters

The plan said Task 3 would touch exactly 4 lines and said nothing about the progress
block. It moved after grounding the numbers, and the reasoning is committed as a comment
inside the block itself:

- `completed_phases: 20 → 21`. The 23/23.1/23.2 close-outs deliberately left these alone
  because those phases sat *outside* the milestone's tracked range. Phase 36 does not —
  it is at ROADMAP line 3635, below the `## v0.8 Phase Details` marker (1050) and above
  the Parked section (3706).
- `total_phases` stays **27**: `### Phase ` headings in that range number 28, minus the
  1 parked (Phase 22) = 27, so phase 36 was *already* in the denominator.
- `total_plans: 349 → 352`, `completed_plans: 347 → 350`. Phase 36's three plans were
  never entered at plan time — `b0ae2941d` (`mark phase 36 planned`) left the counters at
  347/349 — so both numerator and denominator were short by 3. Adding to both corrects
  the ledger without inventing progress.
- `percent` unchanged: 350/352 = 99.43 → 99 (floor, matching this file's convention).

`total_plans` could not be cross-checked against ROADMAP checkboxes — the tracked range
contains 257 plan lines against a counter of 349, so those two have measured different
things for a long time. The +3/+3 correction is stated as what it is: a delta, not a
recount.

## Verification

**Diff shape** — every file changed exactly as intended, nothing else:

```
.planning/ROADMAP.md      | 27 +++++++++++++++++++++++++----
.planning/REQUIREMENTS.md |  2 +-  (2 lines)
.planning/STATE.md        | 17 +++++++-------
```

STATE.md hunks: `@@ -5,4 +5,4 @@` (frontmatter), `@@ -404,0 +405,9 @@` + `@@ -406,3 +415,3 @@`
(progress block + comment), `@@ -5503,0 +5513 @@` (ledger row). No stray edits.

**Explorer parse replayed over the real tree, before and after** — not reasoned about.
`buildPhaseMap()` from the `gsd-phase-status` extension was run against the HEAD copies of
ROADMAP.md/STATE.md and against the working tree, and **all** phase statuses were diffed.
Exactly two moved:

```
  "active": "36"          ->  "35"
  "35": "pending"         ->  "35": "inprogress"
  "36": "inprogress"      ->  "36": "complete"
```

Phase 36 → `complete` is the intended result. Phase 35 → `inprogress` is the pre-existing
active-phase override landing on the next incomplete phase — the identical, benign
movement recorded when quick `260819-w3n` closed phase 23.2. No other phase moved.

**YAML safety** — STATE.md's frontmatter has never been strict-YAML-parseable (a
pre-existing unescaped `"` pair inside the `stopped_at` scalar). This edit did not add a
second one: the new `stopped_at` and `last_activity` prefixes contain exactly one `"`
each, the opening delimiter. Verified programmatically, not by eye.

**Tooling discipline** — no `gsd-sdk state.*`, `roadmap.*`, or `phase.complete` verb was
invoked at any point ([[gsd-sdk-state-writes-corrupt-state-md]]; `phase.complete` corrupted
both files on 34.14). All three planning files were hand-edited with line-addressed Python
and whole-file-diffed. No `git stash` was used at any point
([[executor-git-stash-strands-concurrent-session]]).

## Housekeeping done first, deliberately

A completed-but-uncommitted quick task (`260819-p2d`, finished 2026-08-19: PLAN.md,
SUMMARY.md, and its STATE.md ledger row) was sitting in the working tree. It was committed
**on its own, by explicit path, before any phase-36 work began** (`7648786a1`), so that
this task's STATE.md commit could not absorb it — the failure mode that put four of a
concurrent session's files into a phase-23.2 commit ([[gsd-sdk-commit-stages-entire-tree]]).

## Still open — recorded, not manufactured

- **No `36-VERIFICATION.md`.** `/gsd-verify-work 36` never ran; the phase rests on 36-03's
  operator gate (PRECONDITION PASS + 10/10). Not fabricated to make the folder look green.
- **No `36-REVIEW.md` / `36-SECURITY.md`.** 36-02 did update the threat register, so the
  security *work* landed; the gate artifacts did not.
- **`36-VALIDATION.md` stays `status: draft`** — deliberate, per the phase's own record.
- **Quick Tasks Completed ledger is missing rows** for `260820-u29`,
  `260820-i18n-gate-scope-dialog`, `260820-ic0`, and `260820-fyl`. A real gap, flagged not
  fixed — out of this task's scope.
- **Phase 36 is complete while Phase 35, which it declares as `Depends on:`, is still
  unplanned.** 36 was executed ahead of its stated dependency. Noted as a roadmap-ordering
  fact, not corrected here.

## Self-Check

```
FOUND: .planning/ROADMAP.md §36 heading carries "— ✅ COMPLETE 2026-08-21"
FOUND: 3/3 plan boxes ticked (- [x] 36-01/36-02/36-03-PLAN.md), Outcome paragraph present
FOUND: .planning/REQUIREMENTS.md — grep -c '^- \[x\] \*\*REQ-36-' returns 5
FOUND: .planning/STATE.md status: ready_to_plan, stopped_at opens "PHASE 36 COMPLETE — ✅"
FOUND: progress 21/27 phases, 350/352 plans, percent 99, with hand-arithmetic comment
FOUND: quick-task ledger row 260821-ihs appended after 260820-kq0
FOUND: meta gates re-run green (154 passed / 1 skipped) — no meta/ file touched
FOUND: explorer parse diff = exactly 2 phase movements (36 complete, 35 the active-rule shift)
FOUND: git diff --stat shows 3 planning files and ZERO source files
FOUND commit 7648786a1 (docs(quick-260819-p2d): committed separately, before this work)
```

## Self-Check: PASSED
