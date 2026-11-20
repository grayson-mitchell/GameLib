---
quick_id: 260823-cis
slug: disposition-gap-cycle-4
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Summary

## The premise I started from was wrong

I had been reporting that all four `34.2-REVIEW-GAP-CYCLE-N.md` reviews were
undispositioned. **They were not.** `34.2-PORTED-CHANNELS.md` §7 already carried a
reconciliation section for each, disposing the previous round's findings one by
one, with `currency-gate.py` pinning every token — and that gate has run in CI
since earlier today.

The claim came from `34.2-REVIEW-FIX.md`'s own scope warning, which was itself
stale. The real gap was exactly one section: review gap cycle 4's findings, closed
across this session's five quick tasks.

## What changed

| Review | Dispositioned by | Findings |
|---|---|---|
| `34.2-REVIEW.md` | `34.2-REVIEW-FIX.md` + `§7 Gap cycle 1` | 17 |
| `-GAP-CYCLE-1.md` | `§7 Gap cycle 2` | 14 |
| `-GAP-CYCLE-2.md` | `§7 Gap cycle 3` | 15 |
| `-GAP-CYCLE-3.md` | `§7 Gap cycle 4` | 14 |
| `-GAP-CYCLE-4.md` | **`§7 Gap cycle 5` (new)** | 20 |

All five reviews dispositioned, zero open, 80 findings.

- **New `### Gap cycle 5 reconciliation`** in `34.2-PORTED-CHANNELS.md`, covering
  all 20 of review gap-cycle-4's findings by commit and quick-task id.
- **`currency-gate.py` extended** per its own documented steps 1–5. No existing
  assertion weakened; cycle 4's ordering pin is inherited so the chain 3 < 4 < 5
  is checked in full.
- **Count corrected: gap cycle 4 has 20 findings, not 17.** The 17 was an early
  miscount that propagated into `deferred-items.md` and a STATE.md row. It changed
  nothing about the work — every finding named in the review is discharged either
  way.

## The RED proof caught a hole in the gate's own design

Dropping `IN-08` from the new section's closure list left the gate **green**,
because `check_cycle_section` only asks whether a token appears *somewhere* in the
section — and `IN-08` is also named in the prose about what the review got wrong.
That is the same "measures the wrong property" class gap cycle 4 was largely
about, reproduced in the gate meant to record it.

Fixed by scoping cycle 5's token search to the section's **closed region**
specifically. Both directions now RED-proved: removing a token from the closed
list fails, and deleting the region's terminator fails. Applied to cycle 5 only —
cycles 3 and 4 keep their assertions untouched, per this file's own rule that
assertions are extended and never weakened.

## Two findings closed as a side effect, recorded

Today's WR-02 fix discharged two long-deferred **gap-cycle-2** findings that had
been carried since: WR-05 (tmp-root string duplicated three times per suite) and
WR-06 (hoisted factories referencing an out-of-scope `const`). Both were in the
gap-cycle-3 reconciliation's deferred list.

## Deliberately not done

Gap cycle 3's frontmatter miscounts its own warnings (`warning: 11`; the body has
WR-01..WR-12). `currency-gate.py:82` already records this and declares the body
authoritative. Review files are immutable historical records by this phase's
convention, so the miscount is documented, not edited.

`34.2-REVIEW-FIX.md` stays `status: partial`, on a corrected basis: its own scope
really is round 1 only (`findings_in_scope: 17`), and `all_fixed` would assert
completeness for a document holding a fifth of the evidence. The old reason —
"four undispositioned reviews" — was wrong and is replaced rather than edited.

## Gates

`pnpm planning-gates` 6/6, including the extended currency gate. Prettier clean on
all four documents.
