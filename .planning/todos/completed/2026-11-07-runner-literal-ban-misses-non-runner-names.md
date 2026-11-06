---
created: 2026-11-07T00:00:00.000Z
title: 'Runner-literal ESLint ban only matches runner/store-named operands'
area: tooling
severity: minor
platform: any
ready: code
found_by: 'Phase 62 code review (62-REVIEW.md WR-02)'
---

The `no-restricted-syntax` runner-literal ban (meta/runnerLiteralSelectors.cjs, wired in eslint.config.mjs) only fires when the compared identifier matches `runner|store|*Runner|*Store`. Live sites it does not see:

- `src/backend/utils.ts:455,461,476` — `library === 'gog'|'legendary'|'nile'` in `clearCache`
- `value === 'sideload'` in `FilterStoreFacet:72`, `FilterFocusRow:135`, `FocusRowStrip:228`, `chipLabels.ts:84`

Shapes it cannot see at all: `gameInfo['runner']`, `(runner as string) ===`, `.indexOf`/`Set.has`, names like `runnerStr`/`storeName`.

Decide per site: convert to `isStore`/`hasCapability`, or document as a deliberate identity check, then widen the selector set (with hit/non-hit tests in meta/__tests__/runnerLiteralSelectors.test.ts) so "zero at error" means what it says.

## Resolution

Resolved by plan 62-23. The seven sites were converted to `isStore`. The selector was widened (`library`/`value` names, `runner*`/`store*` prefixes, cast/non-null/computed access, `indexOf`, inline `Set.has`, switch gated on a store-literal case), with HIT/NON-HIT tests. The remaining blind spots are documented in the `meta/runnerLiteralSelectors.cjs` header.
