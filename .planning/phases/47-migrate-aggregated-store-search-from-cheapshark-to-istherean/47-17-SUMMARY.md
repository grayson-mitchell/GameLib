---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 17
subsystem: store-search/art
tags: [gap-closure, G-47-7, store-search, thumbnail, css, itad]
requires: [47-16]
provides:
  - thumbOf prefers banner300, then banner145, then boxart, then ''
  - .storeSearchRow__thumb landscape contain box (120px, aspect-ratio 300 / 140)
  - storeSearchThumbBox.test.ts coupling the box ratio to the asset family
affects: []
tech-stack:
  added: []
  patterns: [source-text regression test that reads a real stylesheet and a real function body so two coupled halves cannot drift apart]
key-files:
  created:
    - src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts
  modified:
    - src/backend/storeSearch/itad.ts
    - src/backend/storeSearch/__tests__/itad.test.ts
    - src/frontend/screens/StoreSearch/index.css
key-decisions:
  - 'Thumbnail box is 120px wide at 300 / 140 (banner300 measured size) so the preferred asset fills it exactly and is crisp at 2x'
  - 'object-fit: contain on the box itself instead of cover plus a .usingFallback exception: it also letterboxes banner145 (2.64:1), portrait boxart and the 2:3 fallback card, which cover would still crop'
  - 'Cached search rows (ITAD_FRESH_MS, one hour) keep their already-chosen banner145 URL until refresh; under contain they are letterboxed, not cropped'
requirements-completed: [PRICE-01]
duration: 12min
completed: 2026-11-18
status: complete
actuals:
  tokens: 6000
  tasks: 2
  commits: 2
plan_head_before: 8ebe5c7fad571e454fa722e56195cb2897206dc1
plan_head_after: 9421f0c0576e84e8505ebecbde4040a116fe40ae
---

# Phase 47 Plan 17: Store Search art shown whole (G-47-7) Summary

Store Search rows now take ITAD's banner300 and show it edge to edge in a 120px landscape box (`aspect-ratio: 300 / 140`, `object-fit: contain`), with a regression test that fails if the box ratio and the `thumbOf` asset preference change independently.

## What was built

**Task 1 (tracer, TDD), commit `9a9276b33`.** Two tests were added to `itad.test.ts` first and seen red: an item with both banner145 and banner300 maps to banner300, and the real `search-portal` fixture's Portal row thumb matches `/banner300.jpg/`. `thumbOf` in `itad.ts` was then reordered to `banner300 ?? banner145 ?? boxart ?? ''` with a comment tying it to the CSS box. `.storeSearchRow__thumb` in `StoreSearch/index.css` became width 120px, `aspect-ratio: 300 / 140`, `object-fit: contain`, flex-shrink 0 and the existing radius token, with a comment superseding the Phase 20 portrait cover box (20-UI-SPEC:168). The existing `145.jpg` and `box.jpg` assertions are unchanged and still pass (banner145-only and boxart-only rows keep that asset). No other CSS rule was touched.

**Task 2 (TDD), commit `9421f0c05`.** `storeSearchThumbBox.test.ts` (Frontend project, no `jest.mock`, no ceilings entry) reads the real `index.css` with comments stripped, takes the body of the rule whose selector is exactly `.storeSearchRow__thumb`, and asserts `aspect-ratio: 300 / 140`, `object-fit: contain` and no `cover`. It also slices the real `thumbOf` body from `itad.ts`, drops `//` comments (the explanatory comment mentions banner300 and would otherwise mask a reorder), and asserts banner300 precedes banner145 precedes boxart.

## Revert checks (acceptance criterion)

Done locally, not committed, files restored afterwards (`git status` clean for `src/`):

- `thumbOf` reverted to `banner145 ?? banner300`: the asset-order test FAILED, the CSS test passed.
- CSS `object-fit: contain` reverted to `cover`: the CSS test FAILED, the asset-order test passed.
- Both restored: 2/2 pass.

## Verification

- `itad.test.ts`: 36/36 pass (two new).
- Frontend project: 362 of 363 suites pass; the one failure is the known pre-existing `themeTokens.test.ts` render-site census (`.is-link` 39 vs 34), out of scope.
- `storeSearchThumbBox.test.ts`: 2/2 pass. `backendDiCeilings` 132/132. `pnpm codecheck` clean. `pnpm lint:src` exit 0 (pre-existing warnings only). `prettier --check` clean on every written path.
- Human check (macOS, restart `pnpm tauri:dev` so the sidecar carries the new `thumbOf`; search 'hades' and 'xcom'): not run by the executor; harvested at end of phase per the plan. Needs: each row's art is a wide banner shown whole, a game with no art shows the GameLib card whole, and rows still align.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. T-47-55 (accepted): same ITAD asset fields, same host, same CachedImage path; only the field preference changed.

## Self-Check: PASSED

- FOUND: src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts
- FOUND commits: 9a9276b33, 9421f0c05
