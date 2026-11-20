---
quick_id: 260825-wg5
slug: route-34-11-s-unowned-gamepad-focus-scro
date: 2026-08-25
status: planned
---

# Quick Task: route 34.11's unowned gamepad focus-scroll item into Phase 38

## Problem

`34.11-VERIFICATION.md` records a carry-forward it calls "the one item worth escalating…
risks becoming an invisible standing gap if deferred a third time": gamepad focus-scroll
behaviour **in the tier-2 filter panel**, never measured because no physical controller was
available in 34.10 or 34.11.

It has **no owner**. `34.11-VERIFICATION.md` has no `human_verification` key at all, so
`gsd-sdk query audit-uat` cannot see it — the same invisibility that `38-C05`'s own
`prior_state` describes for 34.10's version. Phase 38 currently names 34.11 zero times.

## Is it a duplicate of 38-C05?

**No — different surface, different code, different failure mode.** Established by reading
source, not by reading the two items' prose:

- `38-C05` covers `scrollCardIntoView` (`GamesList/index.tsx:46`), attached to the games
  list at `:139` and hardcoding `document.querySelector('main.content')` as its scroll
  container.
- The tier-2 panel is a **separate** scroll container: `.NavShell__tier2Portal` at
  `NavShell/index.scss:499-505` (`overflow-y: auto`), nested inside `.NavShell__tier2`'s
  `overflow: hidden` (`:401`). It is outside `main.content` entirely.
- `grep -rn "scrollIntoView\|addEventListener('focus'\|onFocus"` over `NavShell/` and
  `Header/` returns **zero hits**. There is no focus-scroll handler for that container at
  all — and `scrollCardIntoView` could not serve it even if it fired, because it would
  scroll the wrong element.

So C05 passing says nothing about this. It needs its own item.

## Tasks

1. Append `38-C06` to `38-VERIFICATION.md`'s `human_verification` array (arrival order —
   appending renumbers no existing ID).
2. Give it a **source-level** `platform_gate` per relocation rule (2), naming the container
   and the absent handler, not a prose blocker.
3. Update `score:` 8 → 9 relocated items.
4. Write the two-way receipt required by rule (3): `human_verification_relocated` in
   `34.11-VERIFICATION.md`. Do **not** add an empty `human_verification: []` — that makes
   `audit-uat` scrape prose.
5. Prove the array still parses and the backlog grew rather than vanished:
   `gsd-sdk query audit-uat` phase 38 must go 8 → 9 and total 19 → 20.

## Success criteria

- `audit-uat` reports 9 items for phase 38, 20 total.
- 34.11 is reachable from Phase 38 and vice versa.
- `34.11-VERIFICATION.md` `status:` stays `passed`; `38-VERIFICATION.md` `status:` stays
  `human_needed` (any other value makes the whole phase emit zero items).
