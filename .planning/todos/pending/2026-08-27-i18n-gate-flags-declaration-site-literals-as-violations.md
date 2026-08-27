---
created: 2026-08-27
title: "The i18n hardcoded-string gate cannot distinguish a key/English-default data table from genuinely untranslated UI text"
area: build
status: OPEN
severity: low
found_by: "Quick task 260827-vpl (WR-18 disposition)"
source: ".planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md WR-18 row"
files:
  - meta/hardcodedStringGate.ts
---

## Symptom

`meta/hardcodedStringGate.ts`'s `scanScope()`/`scanSource()` flag every string literal in a
`[key, defaultText]`-shaped data table as an `object-property` or `argument` violation, with
no exemption for the shape. This is a structural false positive: the literal is not
untranslated UI copy, it is the paired English default for an i18n key that is itself passed
to `t()` at a call site already inside the gate's scope.

**Confirmed affected today:**

- `src/frontend/screens/Library/facetLabels.ts` — 8 violations, all `argument`.
- `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts` — 35 violations,
  `object-property` + `argument`.
- `src/frontend/helpers/gamepad.ts` — a related variant: 3 violations that are CSS-selector
  string literals (`.MuiPopover-root`, `.MuiDialog-root`), which the gate also cannot
  distinguish from user-facing text.

All three files are already listed in `meta/__tests__/genI18nGateScope.test.ts`'s
`DECLARED_UNSCANNED_DEBT` array, and that same test file's own header comment (around
`helpers/gamepad.ts`'s entry) names the right fix in its own words: *"The right fix is in
the gate: stop flagging CSS-selector-shaped literals."* The same reasoning extends to the
key/defaultText data-table shape `facetLabels.ts`/`chipLabels.ts` exhibit.

**Why this is not parked as an allowlist entry.** `meta/i18nGateAllowlist.json` is a
DEFERRAL register (`expectedCount` + a blocking reason) for genuine, deliberately-postponed
untranslated debt — not a place to record a false positive as if it were real debt forever.
Neither of these shapes belongs there.

## What "done" looks like

A gate-heuristic change — most likely recognizing the `[key: string, defaultText: string]`
tuple-table shape (already partially special-cased for `CrossoverBadge.tsx`'s
`labelKeyByTier` per `meta/__tests__/hardcodedStringGate.test.ts`'s "D-14: [key, default]
tuple tables" describe block) and/or CSS-selector-shaped string literals, and exempting both
from `scanSource()`'s violation set. Closing this would let `facetLabels.ts`, `chipLabels.ts`
and `helpers/gamepad.ts` all be removed from `DECLARED_UNSCANNED_DEBT` and folded into
`meta/i18nGateScope.json` proper, with zero violations.

## Explicitly not a 34.11 residual

This item is cross-cutting and pre-dates Phase 34.11 (`helpers/gamepad.ts`'s instance of it
was already carried, unowned by any phase, before this todo existed). Quick task
`260827-vpl` closed 34.11's WR-18 finding by pinning current behaviour with a measured
ratchet (`meta/__tests__/hardcodedStringGate.test.ts`, commit `4e975f3b9`), not by fixing
this gate limitation — the ratchet and this todo are deliberately separate. No
`resolves_phase:` field is set above, matching this project's established convention for
"not resolved by a phase, must not be auto-closed by it" — this todo does **not** hold Phase
34.11 open, the same way the project already carries `helpers/gamepad.ts`'s instance
without blocking any phase.
