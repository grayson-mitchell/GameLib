---
quick_id: 260823-tcu
slug: propagate-item-19-closure-to-cycle-2-rec
date: 2026-08-23
status: complete
type: docs
commits:
  - 182c03eed
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-CYCLE2.md
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md
code_changes: none
---

# Quick task 260823-tcu — cycle 2 records now match reality

`260823-sok` closed ledger item 19 this morning and updated the item itself. It never propagated to
the three records that *restate* that item's disposition, so all three still called C2-07 deferred.

**Fifth instance today of a record outliving its fix — and the first caused by this session rather
than found in it.** The same shape `34.9-REVIEW-FIX.md` presented when the day started.

## What changed

| Record | Was | Now |
|---|---|---|
| `deferred-items.md:555` (cycle-2 table) | `DEFERRED (ledger only, D-C3-05)` | `FIXED`, citing 260823-sok + 34.9-27/34.9-19 |
| `deferred-items.md:851` (cycle-2 review table) | `DEFERRED` | `FIXED`, citing `meta/__tests__/cleanDist.test.ts:451-493` |
| `34.9-REVIEW-CYCLE2.md` frontmatter | note named C2-05 **and** C2-07 | names **C2-05 as sole outstanding**; prior note quoted, not discarded |

Plus a `disposition_updated: 2026-08-23` field, and the Count line under the cycle-2 table annotated
to 7 fixed / 1 deferred.

**`disposition:` deliberately stays `partial`.** One finding is genuinely still deferred; flipping
it to `closed` would be precisely the defect this task exists to fix. Badge replay against the real
extension `parse.js` confirms it still resolves to `inprogress`.

## Two constraints the fix had to satisfy up front

Both were read out of `34.9-REVIEW-SWEEP-CHECK.cjs` before writing, rather than discovered by
watching it fail:

1. **Both C2-07 rows had to move to the same category.** The tool matches `^(FIXED|DEFERRED)\b`;
   any other word (e.g. `CLOSED`) yields a null category, and two rows for one ID resolving to
   different categories fails as `DUPLICATE-ROW`. Hence `FIXED`, not `CLOSED`.
2. **A FIXED row's evidence must cite a plan in this phase (`34\.9-\d+`) and be confirmable outside
   `.planning/`.** `260823-sok` is a quick task, not a plan, so the cells also name **34.9-27**
   (which opened item 19) and **34.9-19** (which authored the pins), and point at
   `meta/__tests__/cleanDist.test.ts:451-493`.

A DEFERRED row faces neither rule, so flipping to FIXED is not a cosmetic edit — it moves the row
into a stricter contract.

## Why nothing caught this

`34.9-REVIEW-SWEEP-CHECK.cjs` verifies that every finding ID **has** a ledger item. It never checks
whether that item is still **open**. A closed item and an open one are indistinguishable to it,
which is why it read 24/24 unmapped 0 the whole time C2-07's disposition was stale — and why it
reads exactly the same now that it is correct. **The sweep is not a staleness detector, and should
not be trusted as one.**

## Found while verifying, deliberately not swept

`disposition_note: >-` parses as the **literal string `">-"`** in the extension's frontmatter
reader — the folded-scalar body is dropped. This affects **all 8** cycle-review files written by
`260823-d7j`, predates this task, does not affect the badge (which reads `disposition`), and is
perfectly readable to a human opening the file. Converting one file's style would create drift for
no gain. Reported rather than fixed.

## Cycle 2 status

**7 fixed / 1 deferred.** The sole outstanding finding is **C2-05 / ledger item 18** — the
arm64-only guard over a both-arch build plus `release:mac`'s `-p always`. It is blocked on the
default-branch push and owned by Phase 34.16.

Cycle 2 flips to `disposition: closed` when item 18 closes. It is one push away.

## Gates

```
REVIEW-SWEEP-OK 24/24 mapped, unmapped 0     (exit 0)
7/7 planning gates passed
badge replay: disposition=partial -> inprogress (unchanged)
```
