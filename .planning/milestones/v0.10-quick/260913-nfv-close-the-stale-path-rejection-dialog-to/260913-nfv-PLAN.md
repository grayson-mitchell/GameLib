---
phase: quick-260913-nfv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md
  - .planning/phases/35-electron-cutover-remove-the-electron-build/35-AB-RETEST.md
  - .planning/phases/34.6-tauri-ipc-re-plumb-slice-9-eos-overlay-steamgriddb-artwork-w/34.6-LIVE-GATE.md
  - .planning/STATE.md
autonomous: true
requirements: [TODO-260913-NFV]

must_haves:
  truths:
    - "The todo is closed on MEASURED evidence against HEAD, not on the say-so of this task's framing: commit cf28d48f4 exists, it changed `height: 25em` to `max-height: 25em`, and that rule is still the live shape of `.errorDialog.error-box` at HEAD."
    - "The closure records the ONE half that shipped (sizing, fixed at the root for all ERROR call sites) and the one half that did NOT (the operator's 'sexier'/visually-plain complaint), so the move to completed/ does not silently swallow an unaddressed request."
    - "The 2026-09-05 staleness audit's NOT-CLOSEABLE verdict is recorded as WRONG and the mechanism named -- it screened the todo's own Solution section rather than measuring HEAD, six days after the fix landed, and the shipped fix took none of the three options that screen looked for."
    - "The two planning docs that hardcode the `pending/` path are repointed to `completed/`, so the move does not leave dangling references."
    - "No source file is touched. `git diff -- src/` is empty at the end of the task."
  artifacts:
    - path: ".planning/todos/completed/2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md"
      provides: "The closed todo, carrying its closure evidence and the surviving residue"
      contains: "cf28d48f4"
  key_links:
    - "src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css"
    - ".planning/phases/35-electron-cutover-remove-the-electron-build/35-11-SUMMARY.md"
---

# Quick 260913-nfv — close the stale path-rejection dialog todo

## Why this is a records fix, not a code fix

`.planning/todos/pending/2026-08-26-path-rejection-dialog-uses-an-oversized-large-text-window.md`
describes a defect that was fixed on **2026-08-29**, two weeks before this task. The todo simply
never left `pending/`.

The fix is commit `cf28d48f4` (Phase 35 plan 11): `.errorDialog.error-box` carried an
unconditional `height: 25em`, a fixed content-independent height, so every `type: 'ERROR'` dialog
rendered as a ~400px scrollable console box regardless of message length. That is precisely the
"oversized large text window" the todo names. It became `max-height: 25em`, fixing the root cause
for all 31 ERROR call sites rather than the two path-rejection ones.

It was live-verified the same day. `35-11-SUMMARY.md:307`: *"Path-rejection sizing — PASS. The
dialog hugs its two-sentence message."*

## Why it stayed open

The 2026-09-05 staleness audit (`260905-upz-AUDIT.md:591`) examined this exact file and filed it
**NOT-CLOSEABLE**, reason: *"Solution explicitly TBD; three options, none chosen."*

That verdict read the todo's own **Solution** section instead of measuring HEAD. The fix had
landed six days earlier — and, decisively, it took **none of the three options** the todo listed
(it was a CSS root-cause change, not a string shortening and not an inline affordance). A screen
asking "was one of the listed options chosen?" was structurally incapable of seeing it. This is
the [[a-todos-prescribed-fix-can-already-be-shipped]] shape.

## Tasks

### Task 1 — verify the closure evidence against HEAD before writing it down

Do not take this plan's own framing on trust. Confirm, at HEAD:

1. `git show cf28d48f4 --stat` names the MessageBoxModal stylesheet.
2. `.errorDialog.error-box` currently declares `max-height: 25em` and NOT a bare `height: 25em`.
3. `35-11-SUMMARY.md` still carries the live PASS line.

If any of these fails, STOP and report — the todo is then not closeable and this plan is wrong.

**Verify:** all three checks pass and are quoted in the summary.
**Done:** the closure rests on re-measured facts, not on the task description.

### Task 2 — write the closure into the todo, then move it

Add to the frontmatter, matching the convention used by the recently-closed todos in
`completed/`:

- `status:` a quoted `RESOLVED 2026-08-29 by Phase 35 plan 11 (cf28d48f4) ...` narrative
- `resolved: 2026-08-29` (the date the fix landed — NOT today; the record should not claim the
  defect survived until now)
- `resolved_by: 35-11 (cf28d48f4); records corrected by quick-260913-nfv`

Add a `## Resolution` section to the body carrying: the mechanism, the live-gate quote, the
audit's miss and why it missed, and — stated plainly, not buried — the residue:

- The operator's original complaint had two halves, *oversized* and *visually plain* ("sexier").
  Only the sizing half was fixed. Whether the plain presentation is still worth changing is a
  live question, deliberately NOT closed by this task.
- The todo's cited line numbers had rotted (`installFlowRegistration.ts:317`/`:444` → `:325`/
  `:467`).

Move with plain `mv`, never `git mv` — `git mv` stages the rename the instant it runs, and a
staged rename on this repo gets swept into whatever a concurrent session commits next.

**Verify:** file is absent from `pending/`, present in `completed/`, and the residue paragraph
exists.
**Done:** the record is accurate about what shipped AND what did not.

### Task 3 — repoint the two docs that hardcode the pending path

- `35-AB-RETEST.md:668`
- `34.6-LIVE-GATE.md:2107`

Change `todos/pending/` to `todos/completed/` on those lines only. Leave surrounding prose alone.

**Verify:** `grep -rn "todos/pending/2026-08-26-path-rejection" .planning/` returns zero hits.
**Done:** no dangling references to the old path.

### Task 4 — gates and STATE

Run `pnpm planning-gates`. The todo-frontmatter gate is scoped to `pending/` only
(`todo-frontmatter-gate.py:85` asserts it), so `completed/` is exempt and the move cannot trip it;
the surviving `pending/` corpus stays non-empty, which is the one thing that gate does check.

Update STATE.md by hand — the quick-task row plus a PREPEND inside `last_activity`'s existing
single quotes. Never `gsd-sdk state.*`.

**Verify:** gates green; `git diff --numstat .planning/STATE.md` shows a small edit, not hundreds
of deletions.
**Done:** records consistent, nothing corrupted.
