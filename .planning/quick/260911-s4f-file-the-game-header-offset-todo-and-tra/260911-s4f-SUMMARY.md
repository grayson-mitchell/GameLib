---
phase: quick-260911-s4f
plan: 01
subsystem: testing
tags: [live-gate, humble-keys, css-alignment, evidence-preservation, state-md]

requires:
  - phase: quick-260911-qds
    provides: REQ-43-19 run 2 verdict table layering convention (SUPERSEDED-row shape, provenance blockquote shape)
provides:
  - REQ-43-19 live gate run 3 transcribed into 43-LIVE-GATE.md as its own run layer
  - Run-1/run-2 FAILs (item 2 KEY-column, item 3 both GAME-column rows) superseded to PASS by e344f589d's alignment fix
  - New ready:code todo for the GAME column header-vs-titles 5.5 CSS px offset, the sole remaining Phase 43 blocker
  - 43-12-evidence/ preserving all 8 run-3 artifacts out of /tmp
affects: [phase-43-humble-keys-screen]

tech-stack:
  added: []
  patterns:
    - "Live-gate run layering: each run's table rows carry their own Run number; a superseded row keeps its original measurement text verbatim and only its Result cell becomes 'SUPERSEDED by run N (was <original>)'"
    - "STATE.md stopped_at is prepend-only behind a ' PRIOR: ' marker, never replaced"

key-files:
  created:
    - .planning/todos/pending/2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles.md
    - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-12-evidence/ (8 files)
  modified:
    - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md
    - .planning/STATE.md

key-decisions:
  - "Item 3's new header-vs-titles sub-check (5.5 CSS px) scored against the literal per-row metric, not re-scored against the friendlier title-to-title agreement (1.0) that passed alongside it, per hard constraint 2"
  - "Item 3's run-1 no-logo-row FAIL superseded WITH evidence (a second 9-row sample covering GOG-logo and no-logo TYPE-cell shapes), per the orchestrator-supplied ADDENDUM that closed the plan's own flagged sample-composition gap, rather than left as an inferred/ambiguous supersession"
  - "Run-2 deviation numbering in the plan text (5-7) was factually wrong against the live document (actual: 5-8); run-3 deviations correctly start at 9, documented as a correction rather than silently followed"

requirements-completed: [REQ-43-19]

duration: unknown (session continued from mid-task compaction; no reliable start timestamp)
completed: 2026-09-11
---

# Quick Task 260911-s4f: Transcribe REQ-43-19 Run 3 and File the GAME Header Offset Todo Summary

**REQ-43-19 live gate run 3 transcribed into 43-LIVE-GATE.md; e344f589d's alignment fix supersedes three run-1/run-2 FAILs to PASS (executed census: 28 PASS / 1 FAIL across 29 scored, matching the plan's own predicted one-remaining-FAIL), and the sole surviving FAIL — a 5.5 CSS px GAME-column header offset — is filed as a new `ready: code` todo.**

## Performance

- **Duration:** unknown — this execution continued from a mid-task compaction; no reliable start timestamp was captured for this portion of the session. Prior portion (Task 1: evidence preservation, PNG inspection, P11 scan, todo filing) completed before compaction.
- **Completed:** 2026-09-11
- **Tasks:** 3/3 completed
- **Files modified:** 11 (1 new todo, 8 new evidence files, 1 modified gate document, 1 modified STATE.md)

## Accomplishments

- Preserved all 8 run-3 evidence files into `43-12-evidence/` (verified free before use), each PNG visually inspected before copying, P11 redaction scan run and every match classified benign.
- Filed `2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles.md` with the four ruled-out hypotheses and a `tauri:dev`-not-more-pixels next step, `severity: minor` / `platform: any` / `ready: code`.
- Transcribed run 3 into `43-LIVE-GATE.md`: retitled the verdict heading for all three runs, added a run-3 provenance blockquote, superseded item 2's run-2 FAIL and item 3's two run-1 FAILs to PASS (each retaining its original measurement text verbatim), re-confirmed items 4 and 6, added a dedicated pre-measurement alignment-declarations-confirmed build-record row, added four run-3 deviations (numbered 9-12, correcting the plan's wrong prediction of 5-7 for run 2), and recorded that run 3 surfaced no new *contract* defect.
- Executed the document's own live census command against the fully-edited table (not predicted) and wrote its real output into a new census block, tallying 28 PASS / 1 FAIL across 29 scored — matching the plan's own stated expectation of one remaining FAIL exactly.
- Retitled and extended the "Note on item 3's FAIL rows" section to record that the run-1/run-2 rows it discusses are now superseded, and added a new paragraph analyzing the distinct run-3 header-offset FAIL.
- Updated the "Phase 43 does not close" paragraph: the prior `ready: human` centring todo is now moot; the sole remaining blocker is the new `ready: code` header-offset todo, linked by filename.
- Prepended STATE.md's `stopped_at` with a run-3 narrative behind a ` PRIOR: ` marker; verified the prior ~5,031-character value survives byte-for-byte.
- Added a `260911-s4f` row to STATE.md's Quick Tasks Completed table, in quick_id order immediately after `260911-r8u`.

## Task Commits

1. **Tasks 1 + 2: Preserve evidence, file todo, transcribe run 3 into 43-LIVE-GATE.md** - `2ed34531c` (docs)
2. **Task 3: Record run 3 in STATE.md (prepend stopped_at, add table row)** - `3e7d37155` (docs)

**Plan metadata:** commit pending (this SUMMARY.md and PLAN.md, committed after self-check — see below)

## Files Created/Modified

- `.planning/todos/pending/2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles.md` - New todo for the GAME column header-vs-titles offset
- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-12-evidence/measurements-run3.md` - Run-3 source of truth, preserved out of `/tmp`
- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-12-evidence/{capture-1-probe,capture-2-top,capture-3-gog,crop-game-column}.png` - Run-3 screenshots
- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-12-evidence/{p1-precondition,gamelib-launch-1,terminal}.log` - Run-3 logs
- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md` - Three-run verdict table, recounted VERDICT line
- `.planning/STATE.md` - Prepended `stopped_at`, added Quick Tasks Completed row

## Decisions Made

- Item 3's new header-vs-titles sub-check (335.5 vs 340.0-341.0, divergence 5.5) was scored FAIL against the contract's literal per-row metric, deliberately not re-scored against the friendlier title-to-title agreement (1.0) that passed in the same run — matching the discipline already applied twice earlier in the document (item 3's run-1 rows, item 2's run-2 row).
- Item 3's run-1 no-logo-row FAIL is superseded WITH evidence, not left ambiguous: the orchestrator supplied a plan amendment (an `## Item 3 -- ADDENDUM` section appended to `measurements-run3.md` after the plan was authored) providing a second 9-row sample from `capture-3-gog.png` covering all three TYPE-cell shapes (7 Steam-logo, 1 GOG-logo, 1 no-logo), closing the sample-composition gap the plan's Task 2c had originally flagged as unresolvable from the source alone.
- Corrected a factual error in the plan text: Task 2e stated run-2 deviations were numbered 5-7 (predicting run-3 starts at 8), but the live document's `### Run-2-scoped deviations` subsection actually contains four items numbered 5-8. Run-3's four deviations are numbered 9-12; the correction is stated in the new subsection's lead-in rather than silently followed or silently deviated from.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected run-2 deviation numbering assumption**
- **Found during:** Task 2 (transcribing run 3's declared deviations)
- **Issue:** Plan text (260911-s4f-PLAN.md:294) asserted "run-2 used 5-7, so run 3 starts at 8." The live document's `### Run-2-scoped deviations` subsection actually numbers four items 5, 6, 7, 8.
- **Fix:** Verified directly against the file, numbered run-3's four deviations 9-12, and stated the correction explicitly in the new subsection's lead-in sentence.
- **Files modified:** `43-LIVE-GATE.md`
- **Verification:** Re-read the file's actual `### Run-2-scoped deviations` list before numbering; confirmed four items present.
- **Committed in:** `2ed34531c`

### Process Note (not a Rule 1-4 deviation)

The plan's Task 3d instruction ("Stage exactly: the new todo, `43-12-evidence/`, `43-LIVE-GATE.md`, `.planning/STATE.md`, and this plan directory") reads as a single terminal commit for the whole plan — Tasks 1 and 2 carry no commit instruction of their own, only Task 3 does, naming all five paths together. This executor instead followed the standing per-task commit protocol (`task_commit_protocol`) and committed after Tasks 1+2 (`2ed34531c`) and again after Task 3 (`3e7d37155`), plus a third commit below for this SUMMARY.md and the plan directory. Net effect is identical — the same five paths are committed, nothing is missing or duplicated — but as three commits instead of one. Noted here rather than silently reconciled, since the plan's success criteria literally states "one commit."

---

**Total deviations:** 1 auto-fixed (1 bug — wrong deviation-numbering prediction), plus 1 process note (three commits instead of one, no content difference).
**Impact on plan:** No scope creep. The numbering correction is a factual fix required for the document to be internally consistent; the commit-count difference has no effect on what is recorded or where.

## Issues Encountered

- The Edit tool repeatedly failed to match an `old_string` for inserting the run-3 deviations subsection, despite the text appearing byte-identical under `python3 repr()` inspection — resolved by using a Python script to do a single unambiguous `content.replace(old, new, 1)` with an `assert count == 1` sanity check, verified afterward.
- The Bash tool's own output rendering silently dropped words from large file reads (a compression/headroom side effect, not a file-content issue) — worked around by using the Read tool or `python3 repr()` prints for any text needed byte-exact for edit anchors, rather than trusting a rendered Bash/Read result verbatim.

## P11 Redaction Scan (Task 1c)

Ran `grep -nE '[A-Za-z0-9]{4,}-[A-Za-z0-9]{4,}-[A-Za-z0-9]{4,}'` across `measurements-run3.md`, `gamelib-launch-1.log`, `terminal.log`, and `p1-precondition.log`. 25 total matches (1 + 8 + 16 + 0), all classified benign: git SHAs, ISO timestamps, session directory names (`gamelib-gate-20260911T075450Z`), Vite content-hash filenames, sha256 hashes, and target triples. None resembled a Humble redemption-code shape. Nothing redacted.

## Per-PNG Visual Inspection (Task 1a)

All four PNGs downscaled with `sips -Z 900` into the session scratchpad and opened via the Read tool before copying:
- `capture-1-probe.png` — confirmed: GameLib window, Library tab at launch.
- `capture-2-top.png` — confirmed: near-black theme, Humble Keys list top.
- `capture-3-gog.png` — confirmed: light theme, GOG/Racine and no-logo rows visible.
- `crop-game-column.png` — confirmed: annotated GAME-column crop showing the header-vs-title offset.

## Executed Census (verbatim, run against the fully-edited table)

```
awk '/^## Verdict/,/^### Note on item/' 43-LIVE-GATE.md | grep '^| ' \
  | awk -F'|' '{print $(NF-1)}' | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn
```

```
  27 PASS
   3 SUPERSEDED by run 3 (was **FAIL**)
   3 NOT ATTEMPTABLE
   2 SUPERSEDED by run 3 (was PASS)
   2 NOT RECORDED (run 2)
   1 SUPERSEDED by run 2 (was NOT ATTEMPTABLE)
   1 SUPERSEDED by run 2 (was **FAIL** (light theme only; PASS in both dark themes))
   1 SUPERSEDED by run 2 (was **FAIL** (GOG; Steam passes))
   1 Result
   1 PASS (Steam)
   1 NOT RECORDED (run 3)
   1 NOT PERFORMED (run 3)
   1 NOT PERFORMED
   1 NOT OBSERVED
   1 INCONCLUSIVE — metric compares an icon BOX top to a glyph INK top; ~2–3px is the expected internal-leading gap at 16px/1.2
   1 **FAIL**
```

Excluding the header row (`Result`, 1) and every `SUPERSEDED …` bucket (3+2+1+1+1 = 8): **28 PASS / 1 FAIL across 29 scored.** This matches the plan's own stated expectation ("one remaining FAIL (item 3) is the expectation") exactly. Re-executed a second time (post-write, for this summary) with identical output, confirming the pasted block matches the live file.

**Recounted verdict line written into the document:** "VERDICT: FAIL — 28 PASS / 1 FAIL across 29 scored sub-checks (run 1 + run 2 + run 3 combined, `SUPERSEDED` rows excluded)." Phase 43 does not close; the sole remaining blocker is item 3's 5.5 CSS px GAME header offset, tracked by the new `ready: code` todo.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 43 does not close. The sole remaining blocker is the GAME column header offset (5.5 CSS px), tracked by `2026-09-11-humble-keys-game-column-header-label-sits-5px-left-of-row-titles.md` (`ready: code`). Its cause is unestablished and needs a `tauri:dev` DOM inspection run, not another packaged-build capture session.
- The prior `ready: human` centring design-decision todo is now moot — titles agree with each other to 1.0 CSS px and no longer diverge by alignment choice.
- GameLib (PID 70156) was never touched, driven, built, or quit during this task, per hard constraint 1.

---
*Phase: quick-260911-s4f*
*Completed: 2026-09-11*
