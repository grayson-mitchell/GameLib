---
quick_id: 260826-y8n
status: complete
completed: 2026-08-26
---

## Diagnosis — by replaying the parser, not by reading prose

The folder's yellow had **two independent causes**, and the contents were never one of them:
all tier-1 artifacts already rolled up `complete`.

1. **STATE.md's `stopped_at` named 34.6 as the ACTIVE phase.** It opened
   `"PHASE 34.6 GAP CYCLE 2 AT ITS BLOCKING HUMAN CHECKPOINT..."` — a phase reference with no
   outcome word attached, so `parseActivePhase()` returned `"34.6"` and `buildPhaseMap()` rewrote
   the status to `inprogress`, which `applyFolderState()` then cannot overwrite because the
   override clears `weakOnly`. Wholly stale: 34.6-21 completed hours earlier.
   **Fixed** by rewriting it as a completion record. Verified empirically before editing:
   `parseActivePhase` moves `"34.6"` → `"35"`.
2. **`34.6-REVIEW.md` — and this one was MY error, made earlier today.** I had "fixed" the red
   badge by editing the review's own `status:` to `resolved`. That is the wrong repair: a REVIEW's
   `status:` is stale BY DESIGN, records what was FOUND, and pairs with a `REVIEW-FIX.md` sibling
   the way PLAN pairs with SUMMARY. Rewriting it destroys the record.
   **Fixed** by restoring the found-state (`issues_found`, `critical: 1`, `warning: 3`, `total: 4`,
   all four finding sections untouched) and writing `34.6-REVIEW-FIX.md` with the dispositions.

## Attribution proven in three directions

Against the real `parse.js`, not asserted: `reviewStatus(found, 'resolved')` → `complete`;
`reviewStatus(found, null)` → `blocked`; `reviewStatus(found, 'partial')` → `inprogress`. The
withheld control is what shows the sibling is genuinely being read.

## Result

`parseActivePhase` → `35`. All five tier-1 artifacts resolve `complete`. `rollup` → `complete`.

## Process notes

STATE.md is ~850KB and the SDK's `state.*` verbs corrupt it, so `stopped_at` was rewritten with a
single anchored edit and the diff asserted at **one hunk, +1/−1**. No `state.*` verb was invoked.

The lesson this cost: I had the "never edit a REVIEW's status, write the sibling" rule in memory
and still took the shortcut, because the question asked was "why is it red" and editing the field
answered the symptom. Reading the colour's cause is not the same as running the parser — the same
trap the memory records for ROADMAP prose.
