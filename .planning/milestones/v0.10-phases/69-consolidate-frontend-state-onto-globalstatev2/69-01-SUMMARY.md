---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 01
subsystem: frontend-state
tags: [zustand, storeKit, test-utils, boot]
requires: []
provides:
  - bindStoreHooks / registerStoreForReset / resetAllStores (storeKit)
  - withStoreHooks node-env react stand-ins
  - once-guarded initStateSubscriptions() wired into index.tsx
affects: [69-02 through 69-24]
tech-stack:
  added: []
  patterns: [subscribeWithSelector stores with callable useShallow hooks, module-scope reset registry]
key-files:
  created:
    - src/frontend/state/storeKit.ts
    - src/frontend/state/__tests__/storeKit.test.ts
    - src/frontend/testUtils/storeHookReact.ts
    - src/frontend/testUtils/__tests__/storeHookReact.test.ts
    - src/frontend/state/initStateSubscriptions.ts
    - src/frontend/state/__tests__/initStateSubscriptions.test.ts
    - .planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md
  modified:
    - src/frontend/index.tsx
key-decisions:
  - "Test-only guard reset marked @public instead of editing knip baseline"
  - "RawStore type kept module-private; only StoreHooks is exported"
requirements-completed: [D-01, D-02, D-05, D-07, D-08, D-11]
duration: ~15 min
completed: 2026-11-10
---

# Phase 69 Plan 01: Store foundation Summary

Callable selector-hook store helper with a reset registry, a node-env `withStoreHooks` react stand-in for component tests, and a once-guarded `initStateSubscriptions()` called from `index.tsx` after hydrate and i18next.init, before `root.render` (non-picker branch only).

## Commits
- 8f04b7c91 storeKit helper and reset registry
- 3904b5dc3 withStoreHooks test helper
- b0af91c83 initStateSubscriptions boot module, index.tsx wiring, todo

## Deviations from Plan
None - plan executed as written. `meta/knip-baseline.txt` unchanged (`@public` tag sufficed). The `.planning` todo is prettier-ignored so excluded from the prettier check. The once-guard test spies on `Set.prototype.add` only as a weak side-effect probe, since the sections are empty for now.

## Verification
Jest (3 new suites, 13 tests, zero `jest.mock`), codecheck, lint (0 errors), find-deadcode, planning-gates (12/12) all pass.

## Known Stubs
`initStateSubscriptions` sections are intentionally empty; later plans fill them.

## Self-Check: PASSED
