---
quick_id: 260823-tcu
slug: propagate-item-19-closure-to-cycle-2-rec
date: 2026-08-23
description: "Propagate item 19's closure into the three cycle-2 records that still call C2-07 deferred"
type: docs
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-CYCLE2.md
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
---

# Quick task 260823-tcu — propagate item 19's closure to cycle 2

Quick task `260823-sok` closed ledger item 19 earlier today and updated the item itself. **It never
propagated to the three places that restate that item's disposition**, all of which still call
C2-07 deferred:

1. `34.9-REVIEW-CYCLE2.md` frontmatter — `disposition_note` names C2-05 **and C2-07**
2. `deferred-items.md:555` — cycle-2 disposition table, C2-07 row
3. `deferred-items.md:851` — gap-cycle-2-review table, C2-07 row

This is the fifth instance today of a record outliving its fix, and the first one **caused by this
session** rather than found in it — the same shape `34.9-REVIEW-FIX.md` presented at the start of
the day.

**The sweep tool structurally cannot catch this.** `34.9-REVIEW-SWEEP-CHECK.cjs` checks that every
finding ID *has* a ledger item; it never checks whether that item is still open. A closed item and
an open one are indistinguishable to it, which is why it stayed green at 24/24 throughout.

## Task 1 — flip both C2-07 rows, following the IN-03 precedent

IN-03's precedent in this same ledger is **flip the row and annotate below**, not annotate-in-place:
a disposition table states where a finding stands *now*, and the prose note carries the history.

Both rows must move to the **same** category. `34.9-REVIEW-SWEEP-CHECK.cjs` matches
`^(FIXED|DEFERRED)\b`; any other word yields a null category, and two rows for one ID resolving to
different categories fails as `DUPLICATE-ROW`. So both become `FIXED`, not `CLOSED`.

Two sweep rules constrain the evidence cells, and the fix must satisfy both rather than being
written and then debugged:

- a FIXED row's evidence must cite a plan in this phase (`34\.9-\d+`) — `260823-sok` is a quick
  task, not a plan, so the cells also cite **34.9-27** (which opened item 19) and **34.9-19**
  (which authored the pins)
- FIXED rows must be confirmable **outside `.planning/`** — so the cells cite
  `meta/__tests__/cleanDist.test.ts:451-493` directly

## Task 2 — correct the cycle-2 frontmatter

`disposition_note` is rewritten to name **C2-05 as the sole outstanding finding**, and the prior
note is quoted inside it rather than discarded — it was accurate when written this morning.

**`disposition:` stays `partial`.** That is the honest value: one finding is genuinely still
deferred. Flipping it to `closed` would be the exact defect this task exists to fix. It becomes
`closed` only when item 18 closes, which needs the default-branch push and Phase 34.16.

A `disposition_updated: 2026-08-23` field is added so the next reader can date the claim.

## Task 3 — verify, don't assume

- `34.9-REVIEW-SWEEP-CHECK.cjs` → 24/24, unmapped 0, exit 0 (the flipped rows must satisfy the
  FIXED-row citation rules, which the DEFERRED rows never had to)
- replay the real extension `parse.js` against the edited frontmatter — confirm `disposition`
  still parses and the badge value is unchanged at `inprogress`
- `pnpm planning-gates` 7/7

## Acceptance

- [ ] Both C2-07 rows read FIXED with plan + non-`.planning` citations
- [ ] Sweep green, exit 0 — no `DUPLICATE-ROW`, no FIXED-row citation rejection
- [ ] Frontmatter names C2-05 as sole outstanding; prior note preserved by quotation
- [ ] `disposition` remains `partial`; badge replay confirms `inprogress`
- [ ] Count line under the cycle-2 table annotated 7 fixed / 1 deferred

## Out of scope

**Item 18 / C2-05 is not touched** — it is blocked on the default-branch push and owned by Phase
34.16. Cycle 2 stays `partial` until then.

Nothing is done about the `disposition_note: >-` folded-scalar issue found while verifying (the
extension's frontmatter parser returns the literal `">-"` and drops the body). It affects **all 8**
cycle-review files written by `260823-d7j`, predates this task, does not affect the badge — which
reads `disposition`, not the note — and is perfectly readable to a human opening the file.
Converting one file's style would create drift for no gain. Reported, not swept.
