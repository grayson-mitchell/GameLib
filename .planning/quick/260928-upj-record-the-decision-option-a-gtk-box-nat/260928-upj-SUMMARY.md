---
phase: quick-260928-upj
plan: 01
subsystem: docs
tags: [planning-ledger, tauri, linux, gtk, uat, yaml]

# Dependency graph
requires:
  - phase: quick-260928-raq
    provides: 38-VERIFICATION.md's `regated_2026_09_28` re-gate fields and `ledger-check.cjs`, the harness this task's checker follows the output convention of
provides:
  - A LOCKED operator decision (option a, GTK-box-native layout) recorded on the Linux `add_child` positioning todo
  - Re-scoped Linux branches of Phase 38 ledger items `38-E03`/`38-E04`, naming the decided strategy and the unbuilt layout instead of an open design choice
  - A `deferral_note` amendment recording the same
  - `upj-check.py`, a quick-task harness proving parsed equality of everything outside the six edited values against the pre-edit commit
affects: [whichever future phase builds the Linux store tab / GTK-box-native layout, quick 260928-tvk (shares the same ledger file, non-overlapping line ranges)]

# Actuals (#2632)
actuals:
  tokens: 15900
  tasks: 2
  commits: 1
plan_head_before: 8c7b1821b7201e6b711459b993c7ed6242f236d8

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ledger re-scope by verbatim quarantine: a new `linux_rescoped_2026_09_28` field quotes the pre-change field value(s) verbatim (escaped double quotes) before the field is rewritten, so the audit trail survives inside the document itself, matching the existing `regated_2026_09_28` convention."
    - "Quick-task checker as negative-control-first harness: `upj-check.py` was built and proven RED against the unedited tree before either target file was touched, following the tracer-task shape."

key-files:
  created:
    - .planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/upj-check.py
  modified:
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md

key-decisions:
  - "Operator LOCKED option (a) (GTK-box-native Linux layout) over (b) upstream/forked tauri-runtime-wry patch, (c) separate top-level Window (segfaults 2-for-2, root cause unknown), and (d) no Linux embed. Recorded verbatim in the todo's new `## Decision (2026-09-28)` section; not re-litigated here."
  - "Todo stays in `pending/` with `ready:` moved from `human` to `code` (not `completed/`) — the layout it tracks is not built, and both `completed/` precedents with a recorded decision closed only once the chosen option had shipped."
  - "Ledger re-scope is NOT a discharge: `38-E03`/`38-E04` stay in `human_verification`, unchanged counts, because there is still something to observe once the layout exists."

requirements-completed: [QUICK-260928-UPJ]

coverage:
  - id: D1
    description: "Todo carries `ready: code` and an appended `## Decision (2026-09-28)` section; original options section untouched; todo stays in pending/"
    verification:
      - kind: other
        ref: "upj-check.py --items 38-E03,38-E04 --deferral-note (todo-* checks)"
        status: pass
    human_judgment: false
  - id: D2
    description: "38-E03/38-E04 Linux branches re-scoped with pre-change text preserved verbatim in linux_rescoped_2026_09_28; deferral_note amended append-only; no item discharged, no count moved"
    verification:
      - kind: other
        ref: "upj-check.py --items 38-E03,38-E04 --deferral-note (ledger-* checks); ledger-check.cjs --open 10 --discharged 16 --retired 10 --no-stale-premise"
        status: pass
    human_judgment: false
  - id: D3
    description: "Phase 38 stays visible to gsd-core audit-uat with unchanged by_phase['38'] count and parse_gap_files: 0"
    verification:
      - kind: other
        ref: "ledger-check.cjs audit-uat-by-phase-38 / audit-uat-parse-gap-files checks"
        status: pass
    human_judgment: false
  - id: D4
    description: "Todo, ledger and checker land in exactly one commit"
    verification:
      - kind: other
        ref: "git show --name-only --format= HEAD (post-commit verify)"
        status: pass
    human_judgment: false

duration: ~30min (not separately timed with a start marker; estimated from turn count)
completed: 2026-09-28
status: complete
---

# Quick 260928-upj: Record the operator's option-(a) decision, re-scope 38-E03/38-E04 Summary

**Recorded the operator's LOCKED decision (option a, a GTK-box-native Linux layout) on the
`add_child` positioning todo, and re-scoped the Linux branches of Phase 38 ledger items
`38-E03`/`38-E04` in the same commit — no implementation, no discharge, counts unchanged.**

## Performance

- **Duration:** ~30 min (estimated; no formal start timestamp was captured for this quick task)
- **Completed:** 2026-09-28
- **Tasks:** 2/2 completed
- **Files modified:** 2 (plus 1 checker script created)

## Accomplishments

- Built `upj-check.py`, a quick-task harness (not a CI gate) that proves parsed equality of
  everything outside six specific edited values, against the pre-edit commit — proven RED on the
  unedited tree first (negative control), then driven to green across both edits.
- Recorded the operator's LOCKED option-(a) decision on the Linux positioning todo in a new
  `## Decision (2026-09-28)` section, moved `ready:` from `human` to `code`, kept the file in
  `pending/`, and left the original `## The decision (options, not a recommendation)` section
  byte-identical as history.
- Re-scoped the Linux branches of `38-E03` and `38-E04` in `38-VERIFICATION.md`: each gained a
  `linux_rescoped_2026_09_28` field quoting its pre-change `blocked_by`/`why_human`/`platform_gate`
  values verbatim, then had only its Linux segment rewritten to name the decided strategy and the
  unbuilt layout as the gate — explicitly `NOT a discharge`. macOS/Windows branch text was left
  untouched.
- Amended `deferral_note` append-only, recording that the one partial exception (38-E03/38-E04's
  Linux branches) changes kind from "open design choice" to "unbuilt layout, plus the still-open
  Linux isolation todo," without moving any item or changing any count.
- Committed the todo, the ledger, and the checker as ONE change, per the todo's own "What this
  gates" same-change instruction.

## Task Commits

Both tasks land in a single commit, by design — the plan deliberately defers Task 1's commit to
Task 2, because the todo's own "What this gates" section requires the ledger re-scope to land "in
the same change" as the decision (mirroring quick `260928-raq`'s single-commit shape).

1. **Task 1: Tracer — checker RED, todo decision, `38-E03` re-scope** — uncommitted at task end
   (by design; see Task 2).
2. **Task 2: Expand — `38-E04` re-scope, `deferral_note` amendment, commit** — `be7c5febf`
   (docs)

**Plan metadata:** SUMMARY/STATE/ROADMAP commit handled by the orchestrator in Step 8 (not part of
this task's commit).

## Negative Control (Task 1, Step A)

`upj-check.py --items 38-E03` was run against the fully unedited tree before either target file
was touched. It exited 1, correctly FAILing at least the required categories (todo frontmatter,
decision-section, `38-E03` rescope-field, and line-count checks), plus several additional
legitimate failures (e.g. the Linux segment still containing stale "decision in ..." phrasing, the
`38-E04` sibling path not yet cited):

```
FAIL todo-frontmatter-order: severity@[3] platform@[4] ready@[] (expected exactly one each, consecutive, in that order)
FAIL todo-prefix-byte-identical: live file does not start with base text (with only 'ready: human' -> 'ready: code' swapped)
FAIL todo-decision-heading-unique: found 0 lines starting '## Decision (2026-09-28)', expected 1
FAIL todo-suffix-starts-with-decision-heading: cannot compute appended suffix because the byte-identical-prefix check failed
FAIL todo-suffix-markers: missing from appended suffix: ['option (a)', '260928-upj', '(b)', '(c)', '(d)', '38-E03', '38-E04', '38-VERIFICATION.md', 'ready: code', 'live-gate', 'UNVERIFIED', 'No code was written', '2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md']
FAIL ledger-keyset:38-E03: expected keys [...,'linux_rescoped_2026_09_28',...], found [... without it ...]
FAIL ledger-new-field-content:38-E03: linux_rescoped_2026_09_28 is absent or not a string on the live entry
FAIL ledger-new-field-position:38-E03: line after regated_2026_09_28 does not start with linux_rescoped_2026_09_28
FAIL ledger-field-linux-segment-changed:38-E03:blocked_by: Linux segment is byte-identical to base (not re-scoped)
FAIL ledger-field-mentions-option-a:38-E03:blocked_by: Linux segment does not mention 'option (a)'
FAIL ledger-field-no-pending-phrases:38-E03:blocked_by: Linux segment still contains pending-decision phrasing: ['decision in ']
FAIL ledger-field-linux-segment-changed:38-E03:platform_gate: Linux segment is byte-identical to base (not re-scoped)
FAIL ledger-field-mentions-option-a:38-E03:platform_gate: Linux segment does not mention 'option (a)'
FAIL ledger-blocked-by-both-paths:38-E03: missing path(s): ['.../2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md']
FAIL ledger-line-count-delta: expected 461 (base 460 + 1 new lines), found 460
```
Exit code: 1. A checker that is green on the unedited tree proves nothing; this one was not.

## Final Verification Outputs

**`upj-check.py --items 38-E03,38-E04 --deferral-note`** (post-edit, pre-commit and post-commit
against `HEAD~1`): all 46 checks PASS, exit 0.

**`ledger-check.cjs --open 10 --discharged 16 --retired 10 --no-stale-premise` plus `--includes`
assertions:**
```
PASS js-yaml-version: 4.1.1
PASS frontmatter-parse
PASS status
PASS open-length: 10
PASS discharged-length: 16
PASS retired-length: 10
PASS unique-ids
PASS gsd-core-status
PASS gsd-core-item-count: 10
PASS audit-uat-by-phase-38: 10
PASS audit-uat-parse-gap-files: 0
PASS audit-uat-total-items: 429
PASS includes:open:38-E03:linux_rescoped_2026_09_28
PASS includes:open:38-E04:linux_rescoped_2026_09_28
PASS includes:open:38-E04:blocked_by
PASS includes:top:deferral_note
PASS no-stale-premise
```
Counts (10 open / 16 discharged / 10 retired) are unchanged from the pre-edit commit, read via
`upj-check.py --print-counts` rather than hard-coded, per the plan's own instruction — this
matches the plan's `planning_observations` expectation exactly.

**`python3 .planning/todos/todo-frontmatter-gate.py`:** exit 0 — "17 pending todo(s) all carry
in-vocabulary severity, platform, ready triage keys."

**`pnpm planning-gates`:** 12/12 planning gates passed.

## Ledger Line Delta

`38-VERIFICATION.md` grew by exactly **+2 physical lines** (459 -> 461), both new
`linux_rescoped_2026_09_28` lines landing below line 102 (one after `38-E03`'s
`regated_2026_09_28` line, one after `38-E04`'s). This is recorded here explicitly for in-flight
quick `260928-tvk`, whose own PLAN cites this ledger's line ranges 1-12, 36-47 and 398-431:
- Lines 1-12 and 36-47 are entirely above this task's first insertion (line 103) and are
  untouched.
- The 398-431 range (per tvk's PLAN, describing the pre-upj file) shifts by +2 in the live file —
  the `38-S02` entry it names now sits at 400-411 instead of 398-409, per the plan's own
  `planning_observations` prediction.

## Prettier Ignored-Status Probe

Both edited paths report `{ "ignored": true, "inferredParser": null }` via
`npx prettier --file-info`, confirming a `prettier --check` over them would be vacuous by
measurement rather than skipped silently. No formatter check was run against them.

## Files Deliberately NOT Edited

- **`.planning/ROADMAP.md:4648`** — a narrative paragraph dated "as of 2026-09-28"; not the
  ledger, not in scope.
- **`38-HUMAN-UAT.md` (around line 680)** — dated sitting narrative whose own text says
  "38-VERIFICATION.md is authoritative"; the ledger is the source of truth, not this file.
- **`40-VERIFICATION.md:108`** — says the layout-strategy decision "is filed as a todo"; that
  statement is still true (the todo still exists, still in `pending/`), so no edit was needed.
- **The sibling isolation todo**
  (`.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`) —
  explicitly NOT decided by this task. It remains `ready: human`.

## Open Tension: Option (a) vs. the Isolation Todo

The sibling isolation todo's third option is "keep Linux off the embed entirely" — the same
status-quo option (d) that this task's decision explicitly rejected for the positioning question.
Now that option (a) is locked (a real, if less flexible, Linux embed), that status-quo option in
the isolation todo is in tension with this decision: choosing it there would mean building a
positioned Linux layout that never ships because isolation was withheld. This task's new
`## Decision (2026-09-28)` section on the positioning todo names this tension explicitly and
defers it to the operator, in the isolation todo itself — it is not resolved here.

## Decisions Made

- Operator LOCKED option (a) — a GTK-box-native layout — over (b) upstream/forked
  `tauri-runtime-wry` patch, (c) separate top-level `Window` (segfaults 2-for-2, root cause
  unknown), and (d) no Linux embed at all.
- The todo stays in `pending/` with `ready: code` (not moved to `completed/`), following the
  precedent that a recorded decision alone does not close a todo — only shipping the chosen
  option does.
- The ledger re-scope is explicitly NOT a discharge — both `38-E03` and `38-E04` remain in
  `human_verification`, unchanged counts, because there is still something to observe (the
  drag-resize/HiDPI behavior of whatever layout is eventually built).

## Deviations from Plan

None — plan executed exactly as written. Two implementation notes worth recording:

1. The checker's first draft of the `linux_rescoped_2026_09_28` field text embedded literal
   double-quote characters (via Python's `\"` escape, which produces a bare `"` at runtime) where
   YAML-escaped quotes (`\"`, a literal backslash-quote pair) were required. This broke YAML
   parsing on the first attempt for both the `38-E03` and `38-E04` edits. Caught immediately by
   running `ledger-check.cjs` right after each edit, as the plan instructs, and fixed by
   constructing the escape sequence as an explicit two-character string (`'\\' + '"'`) rather than
   relying on Python's own string-escaping rules. This is a Rule 1 (bug) auto-fix, contained
   entirely within the scratch script used to apply the edit — it never reached a committed file.
2. The todo's decision-section sentence "No code was written by quick 260928-upj." was initially
   line-wrapped so that "No code" and "was written" fell on separate physical lines, which failed
   the checker's literal-substring marker check (the suffix is checked as one joined string, and
   the wrap introduced a newline + indentation between the two halves). Rewrapped so the full
   phrase stays on one physical line. This is a Rule 1 (bug) fix to a prose formatting choice.

## Issues Encountered

None beyond the two implementation notes above, both caught and fixed before any commit.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The Linux positioning decision is locked and desk-ready (`ready: code`): the next actionable
  step is designing and building the GTK-box-native layout in `src-tauri`, and un-gating
  `unstable` for Linux.
- The sibling isolation todo remains `ready: human` and is the next decision gate before any
  Linux embed ships — the operator should resolve the option-(a)-vs-keep-off tension noted above
  when picking up that todo.
- `38-E03`/`38-E04` remain open in `human_verification`, now correctly scoped to measure the
  built layout's HiDPI/drag-resize behavior once it exists, rather than an as-yet-undecided
  strategy.
- Quick `260928-tvk`'s unexecuted Tasks 2-3 (editing the same ledger's `38-S04` region, lines
  36-47, and reading 398-431) are unaffected: this task's insertions land at lines 103 and 114,
  entirely below tvk's cited ranges except the +2 shift already noted above.

## Self-Check: PASSED

- `.planning/quick/260928-upj-record-the-decision-option-a-gtk-box-nat/upj-check.py` — FOUND
- `.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md` — FOUND, contains `## Decision (2026-09-28)` and `ready: code`
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md` — FOUND, contains two `linux_rescoped_2026_09_28` fields
- Commit `be7c5febf` — FOUND in `git log --oneline`

---
*Phase: quick-260928-upj*
*Completed: 2026-09-28*
