---
phase: 62-module-boundaries-and-decomposition
plan: 23
subsystem: tooling
tags: [eslint, no-restricted-syntax, isStore, gap-closure]
requires: [62-22]
provides:
  - runner-literal ban widened to WR-02 shapes (library/value names, runner*/store* prefixes, cast/non-null/computed access, indexOf, inline Set.has, store-literal-gated switch)
  - seven store-literal comparisons routed through isStore
affects: [meta/runnerLiteralSelectors.cjs, src/backend/utils.ts, FilterStoreFacet, FilterFocusRow, FocusRowStrip, chipLabels]
key-files:
  modified:
    - meta/runnerLiteralSelectors.cjs
    - meta/__tests__/runnerLiteralSelectors.test.ts
    - src/backend/utils.ts
    - src/frontend/components/UI/NavShell/components/FilterStoreFacet/index.tsx
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
    - src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts
    - .planning/phases/62-module-boundaries-and-decomposition/62-SITE-CLASSIFICATION.md
decisions:
  - "Filter facet `value` is a store identity (isStore), not a capability"
  - "Operand-agnostic rule rejected (15 non-identity sites); blind spots documented in selector header"
metrics:
  completed: 2026-11-07
  tasks: 3
---

# Phase 62 Plan 23: Widen the runner-literal ban Summary

Runner-literal selector now sees the WR-02 shapes (4 selectors, widened `RUNNER_NAME`, structural arms), the seven blind-spot sites go through `isStore`, and `pnpm lint` exits 0.

## Commits
- c1bdce615 test: failing selector cases (14 new HIT failing, RED)
- d345872b6 feat: widened selector, 53/53 selector tests, "Known blind spots" header
- 9972b45f3 fix: seven sites converted to `isStore`
- 761272c38 docs: classification rows, todo moved to completed

## Verification
Selector tests 53 pass; `lint:src` showed exactly 7 errors after Task 1 and 0 after Task 2; the four affected frontend jest suites (203 tests) pass; `pnpm codecheck`, `pnpm planning-gates` (12/12), `pnpm boundaries` and `pnpm lint` all exit 0. The two .planning files are prettier-ignored, so no prettier check was run on them.

## Deviations from Plan
None. A first sed attempt failed (macOS `-i -E`) before touching any file; edits were redone with Python.

## Known Stubs
None.

## Self-Check: PASSED
