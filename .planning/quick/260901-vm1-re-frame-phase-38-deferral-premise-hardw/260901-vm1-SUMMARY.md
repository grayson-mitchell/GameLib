---
quick_id: 260901-vm1
slug: re-frame-phase-38-deferral-premise-hardw
status: complete
date: 2026-09-01
commit: d9173ed6a
type: records-only
ships_code: false
---

# Quick Task 260901-vm1 — Summary

**Re-framed Phase 38 from "blocked on hardware we don't have" to "batched because switching
machines costs something." All 29 items are schedulable; none was ever blocked.**

## What was wrong

Phase 38's ROADMAP goal line and all 29 `blocked_by` values in `38-VERIFICATION.md` asserted the
items needed hardware or an OS **this project does not have**. The operator owns a Windows
machine, a Linux machine, an Xbox controller and a second controller. The premise was false for
every single item.

Measured before editing — the tally sums to exactly the 29 items `audit-uat` reports:

| Old value | Count |
|---|---|
| `a game controller` | 8 |
| `a Windows machine` | 7 |
| `a Linux machine` | 5 |
| `a Windows or Linux machine` | 3 |
| `BOTH a Windows and a Linux machine (scored on matrix rows 5 and 7)` | 2 |
| `a Windows machine with TWO registered Steam libraries` | 2 |
| `a Linux machine with TWO registered Steam libraries` | 2 |

## Why it mattered — the framing was load-bearing

"Needs an OS this project does not have" is unfalsifiable: it gives nobody anything to check, so
it is never scheduled and never re-examined. "Costs a machine switch" is a price that competes for
time like any other task. The phase read as waiting on the world when it was schedulable at will —
and its **8 controller items are runnable on the macOS machine today, without leaving the desk.**

**The phase violated its own relocation rule (2)**, which quotes
`blocked_by: "a Windows or Linux machine"` verbatim as the cautionary example of a prose blocker
that "rots without anyone noticing". Every one of the 29 values was that exact shape, and it
rotted exactly as the rule predicted, standing from 2026-08-22 to 2026-09-01. A rule written into
a document does not enforce itself against that same document.

## Changes

**`38-VERIFICATION.md`**
- All 29 `blocked_by` values rewritten to name the deferral COST, preserving every discriminating
  detail (which machine; the two-library requirement; the matrix rows for `38-S15`/`38-S16`).
- `purpose:` frontmatter re-framed — it carried the identical false premise as the goal line, and
  fixing only the ROADMAP would have been this project's recorded "propagation misses a doc" failure.
- Added `deferral_note:` frontmatter recording that the `blocked_by` KEY NAME is historical and its
  values now state cost, not a missing capability.

**`ROADMAP.md`**
- Goal line re-framed, with an explicit ⚠ correction banner naming the old text.
- "gated only on hardware access" → "cost only a controller pairing… on the macOS machine, without
  leaving the desk", flagging the controller leg as the cheapest first sitting.
- Relocation rule (2) annotated with its own 29/29 violation.
- **Stale item count corrected: `Items: 8 as of 2026-08-23` → 29.** Never updated as the S-series
  arrived. Found sitting in the same paragraph as the false premise; fixing one and leaving the
  other would have been the same class of miss.

## Deliberately NOT touched

**All 29 `platform_gate` expressions.** They describe what the macOS dev machine can and cannot
render — true regardless of what hardware the operator owns. Several read "unobservable on this
project's hardware" / "this project's macOS-only hardware" and remain correct. They are the
falsifiable half of each item; editing them would have destroyed the sound part of the ledger
while fixing the unsound part.

Also untouched: every `why_human`, `expected`, `test`, `origin_phase`, `origin_item`,
`prior_state`; `status: human_needed`; the `human_verification` array shape.

## Verification

| Check | Baseline | After | |
|---|---|---|---|
| `audit-uat` total_items | 54 | 54 | ✅ |
| `audit-uat` total_files | 8 | 8 | ✅ |
| `audit-uat` phase 38 items | 29 | 29 | ✅ |
| `platform_gate:` lines | 29 | 29 | ✅ |
| `blocked_by:` lines | 30 | 30 | ✅ (29 items + rule 2's historical quote) |
| Diff lines outside `blocked_by`/`purpose` | — | 0 | ✅ |

The audit check is load-bearing, not ceremonial: the file's own `audit_tool_note` records that
breaking `status:` or the array shape makes this phase vanish from `audit-uat` **silently, with
nothing turning red** — and that this phase's entire content is that array. Verified live
mid-edit, before the ROADMAP was touched, so a YAML break would have surfaced immediately.

Both residual "does not have" matches are inside the new correction text, quoting the old premise
to explain what was wrong. Neither is a live assertion.

## Concurrent-session hazard, handled

A second session's quick task `260901-ud5` was finishing during this one. At the start of this
task its work sat uncommitted — two todo renames staged in the index, plus unstaged `STATE.md` and
todo-body edits. **It committed as `733274b11` partway through this task**, between the status
check and the commit.

The commit used explicit pathspecs (`git commit … -- <3 paths>`) rather than a bare `git commit`,
so nothing was absorbed in either direction and nothing was lost. Confirmed: `d9173ed6a` contains
exactly 3 files. This is the documented "GSD snapshot goes stale vs a concurrent session" hazard
occurring live; the pathspec is what made it a non-event.

## Follow-on worth noting (not actioned here)

`260901-ud5` cleared 12 eslint errors, ran a prettier sweep over 45 files, and fixed the i18n
catalog drift. **Phase 39 owns exactly those workstreams**, and its ROADMAP text already says to
re-measure `pnpm lint` at plan time rather than trust the recorded snapshot. That instruction is
now doubly right — the numbers moved again today.
