---
quick_id: 260823-d7j
slug: badge-review-cycle-artifacts-in-gsd-phas
date: 2026-08-23
status: complete
---

# Summary — 260823-d7j

Eight review documents were invisible in the Explorer: `artifactKind()` matched by suffix
(`name === kind || name.endsWith('-' + kind)`) and a cycle review is named
`34.2-REVIEW-GAP-CYCLE-1.md` / `34.9-REVIEW-CYCLE2.md`, which ends in neither `-REVIEW.md` nor
`-REVIEW-FIX.md`. No badge, and since v0.7.0 no contribution to the folder rollup either.

## What changed

**`~/.vscode/extensions/gsd-phase-status/` → v0.8.0** (not version-controlled; outside this repo)

- `parse.js` — new `REVIEW-CYCLE` kind, matched by regex `-REVIEW-(GAP-)?CYCLE-?<n>.md`
  (separator- and case-tolerant), checked before the suffix scan. New `reviewCycleStatus(fm)`
  reads a per-file `disposition:` through the **existing** `artifactStatus()` vocabulary
  (`closed` → complete, `partial`/`open` → inprogress — no new words), falling back to
  `reviewStatus(fm, null)` when undeclared. Exports `reviewCycleStatus`, `REVIEW_CYCLE_KIND`.
- `extension.js` — tooltip note for the new kind. The badge path needed no other change:
  `decorateArtifact()` already routes non-`REVIEW.md` kinds through `resolveArtifactStatus(kind, fm)`.
- `test-parse.js` — 28 new assertions. `package.json`, `README.md` — version and docs.

**This repo** — `disposition:` + `dispositioned_by:` + `disposition_note:` on the eight cycle
reviews. `status: issues_found` is untouched on all eight; it records what the review FOUND and is
never rewritten.

## The design decision, and why

A cycle review has no `-FIX` sibling of its own and must **not** borrow the folder's. Both fix
ledgers scope themselves to their round-1 review and disclaim the cycles by name
(`34.2-REVIEW-FIX.md:53`, `34.9-REVIEW-FIX.md:54-58`), so inheriting `partial` from them would
attribute a status their own authors refused to give — and would have marked cycles that are
genuinely closed as unfinished.

Deriving it structurally ("cycle N is closed once cycle N+1 exists") was rejected as a guess, and
it is already wrong: 34.2's cycle 4 is dispositioned by a *Gap cycle 5 reconciliation* section with
no cycle-5 file behind it.

## Values, and the evidence each rests on

| File | `disposition` | Evidence |
|---|---|---|
| `34.2-REVIEW-GAP-CYCLE-1.md` | `partial` | CR-01/02/03 closed per cycle 2's own summary; §7 details CR-01. WR-01..07 / IN-01..04 were carried into later cycles, never dispositioned as a set. |
| `34.2-REVIEW-GAP-CYCLE-2.md` | `partial` | `currency-gate.py` CYCLE3 lists: 9 closed, 5 deferred (became D4-DEF-02, two since discharged). IN-04 unaccounted. |
| `34.2-REVIEW-GAP-CYCLE-3.md` | `closed` | CYCLE4_CLOSED_FINDING_TOKENS pins all 14 body findings. CYCLE4_DEFERRED is gap cycle 4's own carry-forward, not this review's. |
| `34.2-REVIEW-GAP-CYCLE-4.md` | `closed` | §7 "Closed (20 of 20). Deferred: none." + CYCLE5_CLOSED_FINDING_TOKENS. |
| `34.9-REVIEW-CYCLE2.md` | `partial` | C2 table: 6 FIXED, C2-05/C2-07 DEFERRED to ledger items 18/19 per locked decision D-C3-05. |
| `34.9-REVIEW-CYCLE3.md` | `closed` | C3 table: C3-01/02/03 all FIXED. |
| `34.9-REVIEW-CYCLE4.md` | `closed` | C4 table: C4-01..05 all FIXED. |
| `34.9-REVIEW-CYCLE5.md` | `closed` | C5 table: C5-01/02 both FIXED. |

## Verification

- **205/205 parser tests pass** (28 new).
- **RED-proofed two ways.** Against a mechanically reverted `parse.js`: 7 of the new tests fail.
  Against **the design that was rejected** — routing a cycle through `reviewStatus(fm, fixValue)`
  like a plain review — exactly the test encoding the decision fails
  (`cycle: the fix pass does not reach the cycle review`). The declared-vs-undeclared assertions
  are internally red-proofed: the same fixture reads `complete` with `disposition: closed` and
  `blocked` without it, so the pass is attributable to the field.
- **Blast radius measured over the real tree, all 54 phase folders, before vs after:
  ZERO changed colour.** 34.2, 34.9 and 34.13 were already `inprogress`, so no green regressed.
  Badges now resolved: 34.2 cycles 1/2 → inprogress, 3/4 → complete; 34.9 cycle 2 → inprogress,
  3/4/5 → complete.
- Both fix ledgers' now-stale "these carry no badge" paragraphs struck through and dated, rather
  than deleted.

## Deliberately not done

`34.13-REVIEW.iter{1,2,3}*.md` and `34.13-REVIEW.part{A,B,C}.md` (8 files) stay unmatched — the
matcher has an explicit test asserting this. They pair with `34.13-REVIEW-FIX2.md` /
`34.13-REVIEW-FIX3.md`, which the extension does not recognise either; badging the reviews alone
would paint 34.13 blocked on criticals those siblings may already discharge. `34.13-REVIEW-FIX{2,3}`
being unrecognised is the same class of hole this task closed and is the natural follow-up.
