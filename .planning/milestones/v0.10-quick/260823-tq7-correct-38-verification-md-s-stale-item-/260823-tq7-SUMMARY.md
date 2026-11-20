---
quick_id: 260823-tq7
slug: correct-38-verification-md-s-stale-item-
date: 2026-08-23
status: complete
description: "Correct 38-VERIFICATION.md's stale `score:` item count (6 → 8) and record the audit-uat id-to-position hazard in `audit_tool_note`"
type: docs
files_touched:
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
---

# Quick task 260823-tq7 — Phase 38's own records corrected

Both defects were found while confirming 38-C05 is audit-visible after `260823-tct` closed WR-01.
Neither was blocking. Both are in the frontmatter of the file that is Phase 38's source of truth.

## Defect 1 — `score:` undercounted by two — FIXED

`6 relocated items` → `8 relocated items`. The `human_verification` array holds 8 (`38-W02`,
`38-W01`, `38-W03`, `38-C01`..`38-C05`) and ROADMAP.md already said 8; the `score:` string had
drifted twice, once as W02 joined (2026-08-22) and again as W03 joined (2026-08-23).

Nothing was mis-audited by this — `audit-uat` counts array entries, not this string. It is the
`summary-can-be-wrong-while-the-record-is-right` shape: the restatement rots while the record stays
true, and the restatement is what a human reads first. No "was 6" history note was added; ROADMAP.md
already carries the arrival sequence and duplicating it would create a second thing to keep in sync.

## Defect 2 — `id:` is absent from the audit output, and position ≠ id — RECORDED

`gsd-sdk query audit-uat` emits each item as a **positional** integer plus the `test:` prose as
`name`. The `id:` field is dropped entirely, so there is no key to join the audit output back to
this file except the prose. And positions do not track ids, because the array is in **arrival**
order:

| audit position | actual id |
|---|---|
| 1 | **38-W02** (tray) |
| 2 | **38-W01** (window buttons) |
| 3 | 38-W03 |
| 4–8 | 38-C01..C05 |

Measured, not inferred — the `test:` prose at position 1 was matched against the `id:` blocks in
the file. Positions 3..8 line up with the ids today, which is what makes this easy to miss: a
spot-check anywhere except the first two rows confirms a mapping that is false.

This is `threat-register-ranges-hide-uncovered-ids` at a sixth site, one step worse than usual —
the id is not merely unused as a key, it is not present in the output at all.

The note added to `audit_tool_note` states the dropped field, the arrival ordering, the concrete
position-1-is-W02 counter-example (so the note is falsifiable rather than a vague caution), the
renumbering consequence when an item is added, and the specific way it bites: relocation rule (3)
has each origin phase name an **id** in its `human_verification_relocated` receipt, so following
that id by counting rows in the audit output lands on the wrong item.

## Verification — by measurement, because this array fails silently

The file's own `audit_tool_note` says breaking the array is silent, so the edit was verified
against the tool rather than by reading:

- **`audit-uat` item list is byte-identical before and after** — captured to
  `p38.before.txt` / `p38.after.txt` and diffed: `(identical)`. Phase 38 still emits
  `status: human_needed` with exactly **8 items**, all `result: human_needed`, in the same order.
- `pnpm planning-gates` → **7/7 passed**.
- `git diff` confirms the blast radius: **one line replaced (`:5`), 13 added (`:16`)**, both in
  frontmatter above `human_verification:`. No item body was changed, added, removed or reordered.

## Out of scope

The tool's behaviour is unchanged. Whether `audit-uat` should emit `id:` is a gsd-sdk question, not
a GameLib one; this task documents the hazard where the reader will hit it.
