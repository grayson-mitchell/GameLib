---
quick_id: 260825-alv
slug: close-c2-05-disposition-on-adc648eb6-and
description: "Close C2-05's disposition on adc648eb6, re-home the x64 residual to ledger items 12/13, and take 34.9's folder green"
status: complete
completed: 2026-08-25
tasks_completed: 2
files_modified:
  - .planning/phases/34.9-.../34.9-REVIEW-SWEEP-CHECK.cjs
  - .planning/phases/34.9-.../deferred-items.md
  - .planning/phases/34.9-.../34.9-REVIEW-CYCLE2.md
commits:
  - 0bec76fb1
  - 8174f4781
  - a2a809198
---

# Quick Task 260825-alv Summary

**Phase 34.9's folder is green, and the field that moved it says something its own ledger supports.**

## The unplanned part: the closure gate refused the honest row, and it was right to

Flipping C2-05's row to a CLOSED-shaped disposition immediately failed
`34.9-REVIEW-SWEEP-CHECK.cjs` twice, in two different ways, and both were the tool working:

1. **`DUPLICATE-ROW C2-05`** — C2-05 appears in *two* tables (the gap-cycle-2 disposition table and
   the later reconciliation table). The tool merges consistent duplicates and fails conflicting ones.
   Editing one row and not the other is exactly the contradiction it exists to catch.
2. **`FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING`** — a FIXED row's evidence had to cite a plan in *this*
   phase (`34.9-\d+`). C2-05 was fixed by **plan 34.16-01**. The rule silently assumed every finding
   raised in a phase is fixed in that phase, so the only representable options were a **false
   `DEFERRED`** or an unscored row. **The gate would have pushed the ledger into lying.**

So the rule was widened (`0bec76fb1`): accept a plan id from any phase, or a commit SHA. A plan id
must carry a dot, which is what stops an ISO date (`2026-08-25`) passing as one. The three rules that
make a FIXED row's evidence *independent* — the SUMMARY ban, the polarity-denial check, the
artifact-citation requirement — are untouched. The phase number was never the load-bearing part.

**RED-proven against five mutations**, control green:

| mutation | result |
|---|---|
| M1 evidence has no plan id and no SHA | `FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING` |
| M4 evidence carries only an ISO date | `FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING` |
| M2 evidence cites a SUMMARY | `FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING` |
| M3 plan id present, no artifact path | `FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING` |
| **M5 ORIGINAL tool, real ledger** | `FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING` |
| CONTROL widened tool, real ledger | **24/24 mapped, unmapped 0, exit 0** |

M5 is the one that matters — it proves the widening is load-bearing rather than cosmetic. Exit codes
were captured by redirect, never through a pipe.

## Task 1 — the ledger (`8174f4781`)

Both C2-05 rows flip `DEFERRED` → `FIXED` citing plan 34.16-01 / `adc648eb6`; item 18 gains a dated
CLOSED block; the count paragraph goes to **8 fixed / 0 deferred**, unmapped still 0. Rows flipped
rather than annotated in place, per the C2-07 and IN-03 precedents in this same file, with the
superseded prose kept verbatim beside them.

**The residual is re-homed, not dropped.** Whether a real x64 onedir tree exists or passes the guard
was never C2-05's subject — that is items 12/13 under Phase 34.16 (plans 34.16-05/06). Both the row
and the CLOSED block say so explicitly, and both state that **closing item 18 does not shrink Phase
34.16 by one plan**, so nobody reads this as "the x64 problem is solved".

## Task 2 — the disposition (`a2a809198`)

`disposition: partial` → `closed`. `status: issues_found` untouched — it records what the review
FOUND and is stale by design.

Badge proof, full pipeline over the real tree, with two controls:

| scenario | cycle 2 | folder | 34.9 |
|---|---|---|---|
| **live (`closed`)** | complete | complete | **complete** |
| flip withheld (`partial`) | inprogress | inprogress | inprogress |
| `disposition` removed | blocked | blocked | blocked |

The colour is attributable to this one field: 33/33 plan pairs and the other eight artifacts already
resolved `complete`, ROADMAP gives 34.9 `unknown` (upgradeable), and STATE names 34.16 active, so no
upstream override is in play.

⚠ **VS Code must be reloaded** for the explorer to repaint — the extension caches decorations.

## What green does NOT mean

`deferred-items.md` carries no frontmatter, so the badge cannot see it. **Items 1/2/3/5/7/9/12/13/17
remain open and externally blocked**, most of them on the same push to `gamelib main`. Green means
34.9's own gates are settled — not that nothing is left. That distinction is now the only thing
standing between this colour and a future reader over-reading it.
