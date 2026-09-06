---
created: 2026-08-27
title: "The i18n hardcoded-string gate cannot distinguish a key/English-default data table from genuinely untranslated UI text"
area: build
status: "RESOLVED 2026-09-06 by Phase 41 Plans 41-02/41-04 (REQ-41-04). The gate heuristic was
  widened (D-14 declaration-site exemption chain plus a closest() method-name check) and all
  three named files were promoted from DECLARED_UNSCANNED_DEBT into the blocking
  meta/i18nGateScope.json at zero violations."
severity: low
found_by: "Quick task 260827-vpl (WR-18 disposition)"
source: ".planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md WR-18 row"
discharged: 2026-09-06
discharged_by: "Phase 41 Plans 41-02 (gate widening), 41-04 (scope promotion)"
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

---

## Disposition (2026-09-06, Phase 41 Plans 41-02 and 41-04) — RESOLVED

### What shipped

**Plan 41-02** (the gate fix this todo asked for): widened
`meta/hardcodedStringGate.ts`'s existing D-14 declaration-site exemption chain —

- `DOTTED_KEY_RE` now recognises i18next namespace-prefixed dotted keys
  (`gamelib:library.filterPanel.runsNatively`), not only the bare form, fixing
  `facetLabels.ts`'s `RUNNABILITY_LABELS` `[key, defaultText]` tuples.
- A new `isKeyDefaultObjectProperty` function extends the same tuple exemption to
  `{ key, defaultText }` object-literal pairings, fixing `chipLabels.ts`'s `chipLabelSpec()`
  branches.
- A new `T_FUNC_TYPE_RE` regex lets `collectTAliases` recognise a locally-declared `TFunc`
  parameter type alias, fixing `chipLabels.ts`'s `resolveLabel()` argument violations.
- `'closest'` was added to `TECHNICAL_DOM_API_METHOD_NAMES`, exempting `gamepad.ts`'s three
  `.closest(...)` call arguments as a *structural* non-candidate check — not the CSS-selector
  content-shape check this todo's Symptom section originally suggested (see correction below).

This is the gate-heuristic change the "What done looks like" section asked for, though
narrower and more targeted than the CSS-selector-content-shape idea floated in the Symptom
section: gamepad.ts's three hits are `.closest(...)` ARGUMENTS, not bare CSS-selector string
literals sitting on their own, so a method-name check on the DOM API call site was the
correct, minimal fix rather than a content-shape regex that would have had to reason about
string *content* looking selector-like.

**Plan 41-04** (this plan, the scope promotion this todo's "What done looks like" section also
asked for): removed all three files from `meta/__tests__/genI18nGateScope.test.ts`'s
`DECLARED_UNSCANNED_DEBT` (44 → 41 entries) and hand-added them to the committed
`meta/i18nGateScope.json` (171 → 174 files), inverting the WR-18 test block in
`hardcodedStringGate.test.ts` from an audit-mode ratchet over unscanned debt to per-file
coverage sourced from the same blocking report as the other 171 files.

### Two corrections to this todo's own framing

1. **gamepad.ts's violations were never bare CSS-selector literals.** This todo's Symptom
   section says gamepad.ts has "3 violations that are CSS-selector string literals
   (`.MuiPopover-root`, `.MuiDialog-root`), which the gate also cannot distinguish from
   user-facing text" and prescribes "stop flagging CSS-selector-shaped literals" as the fix.
   Re-measured at the real line numbers (405, 452, 459, not the 323/370/377
   `genI18nGateScope.test.ts` had also mis-recorded): all three are ARGUMENTS to
   `.closest(...)` calls, not bare selector literals sitting in isolation. Plan 41-02 fixed
   it with a method-name check on the DOM API call site
   (`TECHNICAL_DOM_API_METHOD_NAMES` recognising `closest()`), the same category as the two
   pre-existing `querySelector()` calls already exempted in that file — narrower and more
   targeted than a content-shape regex that pattern-matches string values for
   "looks like a CSS selector."
2. **The D-14 tuple exemption already existed and was WIDENED, not duplicated.** The
   "What done looks like" section frames the fix as recognizing the tuple-table shape as if
   from scratch, citing the existing `CrossoverBadge.tsx` special case as a partial
   precedent. In fact the mechanism (`isKeyDefaultTupleElement`, `DOTTED_KEY_RE`) already
   existed and covered the bare-key form; 41-02's fix widened its regex to the
   namespace-prefixed form and added a sibling `isKeyDefaultObjectProperty` check for the
   object-literal pairing shape `chipLabels.ts` actually uses — one exemption chain widened
   twice, not two new mechanisms built.

### Measured numbers (isolated `scanScope()`/`scanSource()` run, Plan 41-04)

Whole-gate, blocking `scanScope()`:

| Metric | Value |
|---|---|
| `scannedFiles` | 174 |
| `violations.length` | 0 |
| `totalCandidates` | 2132 |
| `staleExemptions.length` | 0 |
| `fileExempt` | `["src/frontend/bootErrorSurface.ts"]` |

Per-file `scanSource()`:

| File | violations | exempted |
|---|---|---|
| `facetLabels.ts` | 0 | 13 |
| `chipLabels.ts` | 0 | 36 |
| `gamepad.ts` | 0 | 0 (legitimate — `.closest()` arguments are discarded by the structural DOM-API check before the `exempted` counter increments, same as this file's pre-existing `querySelector()` calls) |

Sabotage (scratch copy of `facetLabels.ts` with one bare literal appended, scanned via
`extraFiles`, never the real file): violation count rose from 0 to 1, delta exactly +1.

Before-fix baseline (Plan 41-02's measurement, restated here for the closure record): 46
total violations across the three files (8 facetLabels.ts, 35 chipLabels.ts, 3 gamepad.ts).

### Full arc

WR-18 (quick 260827-vpl) pinned the 46 violations as measured debt → Plan 41-02 widened the
gate so all three read 0, still audit-mode, committed scope untouched → Plan 41-04 (this
plan) promoted all three into the blocking scope, so a hardcoded literal added to any of
them now fails CI by name. `pnpm gen-i18n-gate-scope` was not run for the promotion — both
artifacts were hand-edited to preserve `meta/i18nGateScope.json`'s hand-curated provenance,
per this repo's measured regen-cascade hazard.
