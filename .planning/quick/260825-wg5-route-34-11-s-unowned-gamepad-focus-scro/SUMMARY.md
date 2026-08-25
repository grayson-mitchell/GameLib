---
quick_id: 260825-wg5
slug: route-34-11-s-unowned-gamepad-focus-scro
date: 2026-08-25
status: complete
---

# Summary: 34.11's gamepad focus-scroll item routed to Phase 38 as `38-C06`

## Outcome

The item has an owner and is visible to the audit for the first time.
`gsd-sdk query audit-uat`: phase 38 **8 → 9 items**, project total **19 → 20**. Every other
phase's count is byte-identical, so the array parsed and the backlog **grew** rather than
vanishing — the failure mode Phase 38's own `audit_tool_note` warns is silent.

## It is NOT a duplicate of 38-C05

This was the substantive question, and it was settled by reading source, not the two items'
prose. They look alike and are not:

| | 38-C05 | 38-C06 (new) |
|---|---|---|
| Surface | the games grid | the tier-2 filter panel |
| Handler | `scrollCardIntoView`, `GamesList/index.tsx:46`, bound at `:139` | **none exists** |
| Scroll container | `document.querySelector('main.content')`, hardcoded at `:47` | `.NavShell__tier2Portal`, `NavShell/index.scss:499-505` |

`grep -rn "scrollIntoView\|addEventListener('focus'\|onFocus"` across `NavShell/` and
`Header/` returns **zero hits**. The panel's `overflow-y: auto` container — nested inside
`.NavShell__tier2`'s `overflow: hidden` (`:401`) and outside `main.content` entirely — has
no focus-scroll behaviour at all, and `scrollCardIntoView` would scroll the wrong element
even if it did fire there.

So C05 passing says nothing about this surface. Merging them would have violated relocation
rule (4) — a compound item resolves to a single pass/fail and the un-run half disappears.

## Why it was unowned

`34.11-VERIFICATION.md` calls it *"the one item worth escalating… risks becoming an
invisible standing gap if deferred a third time"* — and it was already invisible: that file
carries **no `human_verification` key at all**, so `audit-uat` could never see it. Identical
shape to the invisibility `38-C05`'s own `prior_state` records for 34.10's version.

## Changes

- `38-VERIFICATION.md` — `38-C06` appended to `human_verification` (arrival order, so no
  existing ID's position moves), `score:` 8 → 9 relocated items. `status:` stays
  `human_needed`; any other value makes the whole phase emit zero items.
- `34.11-VERIFICATION.md` — `human_verification_relocated` receipt added, satisfying
  relocation rule (3). `status:` stays `passed`; no empty `human_verification: []` was
  added, since that makes `audit-uat` scrape the document body for phantom items.

`platform_gate` is a source-level expression per rule (2) — it names the container, the
absent handler, and the `navigator.getGamepads()` dispatch loop
(`gamepad.ts:559,678`, line numbers re-verified today), not a prose blocker.

## Verification

- `js-yaml` parses both files; phase 38 emits 9 ids `38-W02, 38-W01, 38-W03, 38-C01..C06`.
- `audit-uat` before/after diffed on `summary.by_phase`: only `38` changed, 8 → 9.
- 34.11's folder rollup is still `inprogress` — unchanged by this task, as intended.

## Note on IDs vs audit positions

Appending `38-C06` renumbers nothing, but the audit still emits **positional** integers with
the `id:` dropped, and this array is in arrival order — position 1 is `38-W02`, not `38-W01`.
Cross-reference by `test:` prose, never by position.

## Not done

Running the item. It needs a physical controller and should be discharged in the same
sitting as `38-C01..C05`, with C05 and C06 back to back so the two scroll containers are
compared under identical input.
