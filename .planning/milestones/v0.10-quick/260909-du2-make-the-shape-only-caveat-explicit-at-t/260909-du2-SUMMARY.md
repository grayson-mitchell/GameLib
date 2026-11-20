---
phase: quick-260909-du2
plan: 01
status: complete
subsystem: meta-i18n-gates
tags: [hardcodedStringGate, i18n, exemption, census, documentation, mutation-testing]
requires: []
provides:
  - "KEY_DEFAULT_SHAPE_ONLY caveat block in meta/hardcodedStringGate.ts — records the 174-file census and the refutation of the file-local dataflow fix"
  - "`// SHAPE ONLY` marker at the final return of both isKeyDefaultTupleElement and isKeyDefaultObjectProperty"
  - "Test pinning the deliberate hole (an untranslated { key, defaultText } object is exempted), mutation-proven load-bearing"
  - "Closed todo: 2026-09-07-t-exemption-fires-on-shape-alone-never-a-real-call-site.md, RESOLVED"
affects: [hardcoded-string-gate]
tech-stack:
  added: []
patterns:
  - "Measure the gate's vocabulary against real call sites BEFORE building the fix the review proposed — the measurement can refute the fix, not just size it"
  - "Pin a known hole with a test whose NAME says it asserts a hole, so a later reader cannot mistake green for a guarantee"
key-files:
  created:
    - .planning/quick/260909-du2-make-the-shape-only-caveat-explicit-at-t/260909-du2-PLAN.md
  modified:
    - meta/hardcodedStringGate.ts
    - meta/__tests__/hardcodedStringGate.test.ts
    - .planning/todos/completed/2026-09-07-t-exemption-fires-on-shape-alone-never-a-real-call-site.md
key-decisions:
  - "Disposition 2, not disposition 1 — and by refutation, not by preference. The census the todo made a precondition showed three of the six shape users have no t-alias call in the file at all, so the proposed file-local dataflow check convicts 22 correct literals."
  - "The hole is left OPEN and unchanged. It has zero live instances; cross-module tracing is out of proportion to it and is a large new surface for the gate to be wrong on."
  - "The pin asserts the hole rather than the absence of one, and says so in its test name, because a test that merely reads green here would be indistinguishable from the gate working."
requirements-completed:
  - TODO-2026-09-07-t-exemption-fires-on-shape-alone-never-a-real-call-site
tasks-completed: 3
tasks-total: 3
duration: single session
completed: 2026-09-09
---

# Quick 260909-du2 — name the shape-only caveat at the exemption site

## What the todo asked for

41-REVIEW.md WR-02: both the 2-tuple and `{ key, defaultText }` exemptions in
`hardcodedStringGate.ts` fire on structure alone, and nothing verifies the pair ever reaches a
`t()`/`tGamelib()` call. Two dispositions were offered — (1) a light file-local dataflow check,
(2) make the caveat explicit at the exemption site — with an explicit precondition on (1):
**measure the gate's vocabulary against real call sites first**, because a check that convicts
`chipLabels.ts` is worse than the hole it closes.

## The measurement, and what it decided

A ts-morph census replaying both exemption predicates verbatim over all 174 files of
`meta/i18nGateScope.json`:

| file                                                                     | tuple | object | local `t`-alias call? |
| ------------------------------------------------------------------------ | ----- | ------ | --------------------- |
| `src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts`   | 4     | 0      | **no**                |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx`    | 2     | 0      | yes                   |
| `src/frontend/screens/Humble/Keys/stateLabels.ts`                         | 10    | 0      | **no**                |
| `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts`     | 0     | 28     | yes                   |
| `src/frontend/screens/Library/components/GameCard/CrossoverBadge.tsx`     | 10    | 0      | yes                   |
| `src/frontend/screens/Library/facetLabels.ts`                             | 8     | 0      | **no**                |

Two findings the review could not have had:

1. **The footprint grew 4 → 6 files in two days.** `consoleSteamTarget.ts` and
   `HumbleKeyGroup/index.tsx` are new users of the tuple shape. The todo's argument that exposure
   scales with a widening scope is confirmed by its own two-day lifetime.
2. **Three of the six have no `t()` call anywhere in the file.** They are exported cross-module
   label tables; the consumer destructures and calls. `facetLabels.ts` documents this in its own
   header.

So disposition 1 as scoped ("does the key reach a t-alias in the SAME file? Cheap, file-local, no
cross-module resolution needed") convicts 22 literals across three genuinely compliant files and
reddens the suite's whole-scope zero-violations assertion. It is **refuted, not deferred**.
Cross-module tracing would close a hole with zero live instances at the cost of teaching a
per-file scanner to follow exports to importers — disproportionate, and a large new way for the
gate to be wrong.

## What shipped

**Task 1 — `meta/hardcodedStringGate.ts`.** A `KEY_DEFAULT_SHAPE_ONLY` block above
`DOTTED_KEY_RE` stating plainly that both predicates are shape matches over an unenforced
invariant, carrying the census table and the refutation, and warning that the numbers are a
snapshot (4 → 6 in two days), not a constant. Then a two-line `// SHAPE ONLY` marker on the final
`return` of **both** `isKeyDefaultTupleElement` and `isKeyDefaultObjectProperty` — the todo's
specific complaint was that the trade-off lived only in the docstrings, so a reader auditing the
function body alone could not tell the check traces nothing.

**Task 2 — `meta/__tests__/hardcodedStringGate.test.ts`.** One test in the REQ-41-04 block feeding
a `{ ns, key, defaultText }` object that is rendered directly (`return spec.defaultText`) and never
passed to `t()`, asserting it is exempted. Named "the { key, defaultText } exemption is shape-only
— an object never wired to t() is exempted too, a measured and deliberate hole", with the
refutation inline so the next reader does not close it and redden the three label tables.

**Task 3.** Todo moved to `completed/` with `status: "RESOLVED 2026-09-09 by quick 260909-du2 …"`,
`resolved_by: quick-260909-du2`, and a Resolution section preserving the census table so the
measurement survives independently of this summary.

## Verification Evidence

- `npx jest --config meta/jest.config.js hardcodedStringGate` — **151/151 passed** (was 150; the
  new pin is the 151st). Includes the whole-scope blocking report: **0 violations across 174
  files**, so no exemption behaviour changed.
- **Non-vacuity, mutation-proven.** Stubbing `isKeyDefaultObjectProperty` to `return false` turns
  the new test **RED** at `expect(result.violations).toHaveLength(0)` (probe applied and reverted;
  `grep -c "NON-VACUITY PROBE"` = 0 afterward). The pin is load-bearing, not a tautology over an
  already-discarded literal — which mattered here, since the neighbouring fixture comment records
  that an all-lowercase two-segment key would have been swallowed by `DOMAIN_RE` and proved
  nothing. The fixture uses the camelCase-segmented `library.filterPanel.chipHiddenOnly` for
  exactly that reason.
- `npx tsc --noEmit` — exit 0.
- `npx eslint meta/hardcodedStringGate.ts meta/__tests__/hardcodedStringGate.test.ts` — **0 errors**,
  11 warnings, all pre-existing and all in `hardcodedStringGate.ts` at 572–588 and ~1450
  (`findReferencesAsNodes()` returning error-typed values inside `isAssignedThenPassedToT`); none
  in the added lines, which are comments and a plain-string fixture.
- `npx prettier --check` on all four touched files — clean.
- `pnpm planning-gates` — **9/9 passed**, including `todo-frontmatter-gate.py` after the
  pending → completed move.

## What is NOT fixed

The hole itself. A config or cache object that coincidentally wears
`{ key: 'a.b', defaultText: '…' }` is still exempt from the gate, and a 2-tuple of the same shape
likewise. That was the todo's own disposition 2 and remains true by design — what changed is that
it is now a documented, tested, measured decision instead of an unstated assumption sitting under
a scope that grew 171 → 174 files during phase 41 alone.

## Issues Encountered

None. The only surprise was the measurement itself inverting the todo's preferred remedy — the
todo called disposition 1 "the real fix" and disposition 2 "the honest minimum"; the census showed
disposition 1 is not available at the scope it was specified for.

---

*Phase: quick-260909-du2*
*Completed: 2026-09-09*
