---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 03
subsystem: ui
tags: [intl, currency, store-search, i18n]
requires: []
provides:
  - formatPrice, formatCachedAt, formatCountryName pure helpers
affects: [47 store-search plans rendering region caption and cached-at line]
tech-stack:
  added: []
  patterns: [Intl formatters with toI18nextCode and try/catch fallback]
key-files:
  created: []
  modified:
    - src/frontend/screens/StoreSearch/helpers.ts
    - src/frontend/screens/StoreSearch/__tests__/formatUsdPrice.test.ts
    - src/frontend/screens/StoreSearch/components/StoreSearchRow/index.tsx
    - src/frontend/screens/StoreSearch/components/StoreSearchBreakdown/index.tsx
    - src/frontend/screens/StoreSearch/__tests__/StoreSearchRow.test.tsx
    - .planning/milestones/v0.6-phases/20-aggregated-store-search-cheapshark/20-UI-SPEC.md
key-decisions:
  - "Kept test file name formatUsdPrice.test.ts (no rename)"
requirements-completed: [PRICE-01, PRICE-03]
duration: 10min
completed: 2026-11-14
---

# Phase 47 Plan 03: Intl price formatting Summary

Replaced USD-only `formatUsdPrice` with an `Intl.NumberFormat` `formatPrice` (ISO code always in the same text node, safe fallback on bad codes), and added `formatCachedAt` and `formatCountryName`.

## Tasks
1. Helpers + tests: 6c63a0cf1
2. Call sites switched, test mock extended with `i18n.language`, `$12.50 USD` expectation, 20-UI-SPEC pointer: 8db17cf04

## Deviations from Plan
None. Task 1's commit left call sites temporarily referencing the removed function until Task 2's commit (task order as planned).

## Verification
Full Frontend jest (329 suites) and `pnpm codecheck` pass; no `formatUsdPrice` left in `src/`.

## Self-Check: PASSED
