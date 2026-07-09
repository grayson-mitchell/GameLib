# Deferred Items — Phase 15

## Plan 15-01

- **Pre-existing lint error (out of scope):** `pnpm lint` reports 1 error in
  `src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx:443` —
  `@typescript-eslint/no-unnecessary-type-assertion`. This file was not
  touched by 15-01 (last modified in Phase 14, commit `88f53fd5`). Verified
  via targeted `npx eslint` on all 15-01-modified/created files
  (`src/common/discounts/badges.ts`,
  `src/backend/discounts/__tests__/badges.test.ts`,
  `src/frontend/screens/Discounts/index.tsx`,
  `src/frontend/screens/Discounts/components/DiscountCard/index.tsx`) — zero
  errors/warnings. Not fixed per scope-boundary rule (Rule 1-3 scope is
  changes directly caused by the current task).
