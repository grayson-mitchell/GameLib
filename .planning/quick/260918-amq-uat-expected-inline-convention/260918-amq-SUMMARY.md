---
phase: quick-260918-amq
plan: 01
subsystem: planning-records
tags: [documentation, uat, conventions, gsd-tooling]
requires: []
provides:
  - "CLAUDE.md UAT item shape convention"
  - "Restated audit-uat body-block-scalar todo (2026-09-18 decision)"
affects:
  - CLAUDE.md
  - .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md
tech-stack:
  added: []
  patterns:
    - "Append-only todo convention: new DECISION sections govern earlier sections, nothing deleted"
key-files:
  created: []
  modified:
    - CLAUDE.md
    - .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md
decisions:
  - "Adopt remedy option 2: accept the 26 existing expected:| blocks in 34.3/34.5/34.6-UAT.md as permanently ledgered by uat-visibility-gate.py; prevent NEW suppressed files via a CLAUDE.md authoring convention rather than flattening old ones."
  - "Severity of the todo reassessed major -> medium: the contamination is now bounded and CI-ledgered (not silently unwatched), though audit-uat's own JSON output still carries no internal indicator."
  - "Readiness stays human (not rubber-stamped to code): item A (27-UAT.md's two multi-paragraph reason: | fields) still needs a remedy SHAPE decided, since flattening is hard-excluded for multi-paragraph blocks by this todo's own census."
metrics:
  duration: "~45 min"
  completed: 2026-09-18
---

# Phase quick-260918-amq Plan 01: UAT expected: inline convention Summary

Added a fourth CLAUDE.md convention teaching the inline `expected:`/`result:` shape for `*-UAT.md`
items and forbidding the block-scalar form, then restated the `audit-uat` body-block-scalar todo
in place to record the 2026-09-18 decision that adopts it — accept the 26 existing hidden blocks
as permanently ledgered, stop new files from being born suppressed.

## What Was Built

**Task 1 — CLAUDE.md convention.** A pure 54-line insertion (0 deletions) into the
`GSD:conventions` region, positioned after "The sidecar's exit contract" and before the region's
end marker. Heading: `### UAT item shape (`expected:` inline, never a block scalar)`. Content:

- The conforming shape (inline `expected:`, `result:` on the next line) vs. the non-conforming
  block-scalar shape, shown side by side.
- The mechanism: `parseUatItems`'s `testPattern` (`uat.js:150`) requires the inline+next-line
  shape; a block scalar means the regex never matches and **every** item in the file vanishes from
  `audit-uat`, not just the one item carrying the block.
- Suppression vs. truncation, with phase 34.5 (22 items, 3 `blocked`, all currently invisible) as
  the concrete proof — a clean-looking audit with items silently missing is worse than an obviously
  wrong `"|"`.
- The gate's honest enforcement limit: `uat-visibility-gate.py` ratchets and fails a new invisible
  item, even in a file absent from its ledger — but only after the item is written.
- An explicit prohibition on flattening the 26 existing blocks, with the `uatRenderCheckpoint`
  (`uat.js:81-82`) trade named as the reason: that reader already dedents `expected: |` correctly
  today, and flattening would regress it to repair `audit-uat`.
- The upstream template trap: a UAT file scaffolded from `~/.claude/get-shit-done/templates/UAT.md`
  (line 23) and `workflows/verify-work.md:230` starts non-conforming and must be hand-corrected.

**Deviation from the literal action text:** the plan's action text asked for the conforming/
non-conforming yaml examples to include the literal `### N. name` item heading line. Including it
verbatim tripped the plan's own automated verify — `awk '/GSD:conventions-start/,/GSD:conventions-end/' CLAUDE.md | grep -c '^### '`
is a naive line-start grep with no code-fence awareness, so a fenced-block line reading
`### 3. Library grid renders owned games` counts as a fifth/sixth convention heading. Resolved by
describing the heading's position in prose (inline code span) rather than reproducing it as a raw
line in the fenced example; the YAML key/value shape (the part the mechanism actually gates on)
is still shown verbatim. This is a Rule 3 fix (blocking issue in the task's own verify) — no
substance was lost, since the heading's unchanged position is stated explicitly in prose.

**Task 2 — todo restatement.** Added `## DECISION 2026-09-18 — remedy option 2 adopted` as the
first body section (after frontmatter, before the existing `# ` title heading), per the file's
established append-only convention (later sections govern earlier ones; nothing deleted). The
section: names what was decided and rejected, points at where the convention now lives, restates
items A/B/C/D by current status, and — per the orchestrator's third correction — explicitly names
the pre-existing body H1 (`# audit-uat parses body YAML too, and that population has never been
counted`, still present unchanged at its original position) as superseded, pointing at the
`RE-MEASURED 2026-09-12` section for the actual count.

Retitled the frontmatter `title:` away from "never-measured" (that word occurs 0 times in the
retitled file; it occurred exactly once, in the old title, before this change) to a title
describing the measured population, the decision made, and the two items still open. Reassessed
`severity` (`major` -> `medium`) and `ready` (kept `human`), each argued in the file against the
CLAUDE.md triage vocabulary — see decisions above and the file's own DECISION section for the full
argument.

**Self-correction during execution:** the first edit attempt accidentally deleted the pre-existing
body H1 line while splicing in the new DECISION section (an Edit `old_string`/`new_string` mismatch
— the H1 was used as match context but not echoed back in the replacement). Caught by the task's
own removed-lines verify (`git diff -U0 | grep '^-[^-]'` surfaced the H1 as a removed line, which
is not a frontmatter key). Fixed by re-inserting the H1 verbatim immediately before `## ITEM B
CLOSED`; final diff shows exactly two removed lines (`title:`, `severity:`), both frontmatter keys,
zero body deletions.

**Task 3 — proof, gates, commit.** Re-ran `gsd-sdk query audit-uat`: output is byte-identical to
the pre-edit baseline (`diff -q` -> `IDENTICAL`), and explicit assertions confirm `total_files=8`,
`total_items=59`, `34.5` absent from `by_phase` — unmoved in both directions, and the assertion did
not crash (fixed the plan's own verify-block bug per the orchestrator's first correction: used
`export SP=...` before invoking `python3`, and used `python3` instead of the plan's `node -e`
one-liner). `pnpm planning-gates` reports `11/11 planning gates passed.` No `*-UAT.md`,
`*-VERIFICATION.md`, or gate `.py` file appears in the tracked-modified set at any point in this
run.

## Deliberately NOT Done

- **The 26 existing `expected: |` blocks** in `34.3/34.5/34.6-UAT.md` are unchanged and remain
  invisible to `audit-uat`. This was the explicit decision (accept as ledgered), not an omission.
- **Item A** (`27-UAT.md`'s two multi-paragraph `reason: |` fields) is unfixed — flattening is
  excluded by this todo's own multi-paragraph census, and no alternative remedy shape was chosen.
  Recorded as the remaining open human question.
- **Item D** (17 milestone-hidden fields across `17-UAT.md`, `18-UAT.md`, `23.2-HUMAN-UAT.md`)
  remains UNMEASURED; out of scope while milestone stays `v0.8`.
- **The upstream template** (`~/.claude/get-shit-done/templates/UAT.md`,
  `workflows/verify-work.md`) was not touched — outside this repo, explicitly out of scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue in verify tooling] Fixed a naive heading-count grep collision**
- **Found during:** Task 1
- **Issue:** The literal `### N. name` UAT-item heading line, shown verbatim in a fenced yaml
  example as the plan's action text requested, tripped the plan's own `^### ` heading-count
  assertion (which is not code-fence-aware) — inflating the count from the wanted 4 to 6.
- **Fix:** Rewrote the examples to describe the heading's position in prose (inline code span)
  rather than reproducing it as a raw fenced-block line; the actual gated shape (`expected:`/
  `result:` key-value lines) is still shown verbatim.
- **Files modified:** CLAUDE.md
- **Commit:** bb394d2c9

**2. [Rule 1 - bug] Fixed an accidental body deletion during the DECISION section splice**
- **Found during:** Task 2
- **Issue:** The Edit tool call that inserted the `## DECISION 2026-09-18` section dropped the
  pre-existing body H1 line (`# audit-uat parses body YAML too...`) because it was used as match
  context in `old_string` but not echoed in `new_string`.
- **Fix:** Re-inserted the H1 line verbatim, in its original position, immediately before
  `## ITEM B CLOSED`.
- **Files modified:** .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md
- **Commit:** e753870dc

**3. [Rule 3 - blocking issue] Fixed the plan's Task 3 verify-block env-export bug**
- **Found during:** Task 3 (flagged in advance by the orchestrator's first correction)
- **Issue:** The plan's verify block assigned `SP=...` as a bare shell variable, not exported,
  then read `process.env.SP` inside `node -e` — `undefined` there, which would have crashed the
  assertion rather than measured it.
- **Fix:** Used `export SP=...` and `python3` for the assertion instead of the plan's `node -e`
  one-liner.
- **Files modified:** none (verification-only)
- **Commit:** n/a (not a code change)

## Self-Check: PASSED

- FOUND: CLAUDE.md
- FOUND: .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md
- FOUND: commit bb394d2c9 (Task 1)
- FOUND: commit e753870dc (Task 2)
