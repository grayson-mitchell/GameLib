---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 18
subsystem: store-migrations
tags: [gap-closure, g2, g3, zod, strip, wr-04, wr-05]
requires: []
provides:
  - "stripToSchema(value, schema, { dropInvalidOptional }): one schema-derived strip for GameInfo and settings migrations"
key-files:
  created:
    - src/backend/storeMigrations/schemaStrip.ts
    - src/backend/storeMigrations/__tests__/schemaStrip.test.ts
requirements-completed: [ARCH-03, ARCH-03.4, ARCH-03.5]
completed: 2026-11-14
---

# Phase 70 Plan 18: Shared schema-derived strip Summary

`stripToSchema` reads the zod schema at call time and removes what the strict schema rejects structurally: undeclared keys at every depth (objects, array elements, record values), null on members that accept undefined but reject null, and with `dropInvalidOptional` an optional member that still fails after cleaning (inner-first). Loose objects pass through, unions clean against the first arm the cleaned value satisfies, and it is pure and total (built with `Object.fromEntries`, so a `__proto__` key cannot pollute).

## Commits

- 86fbc5743 test(70-18): failing tests (RED)
- 317b93741 feat(70-18): implementation (GREEN)
- a02bd409b test(70-18): drift guards against real project schemas

## Verification

24 tests pass (rule-by-rule plus real steam/gog/legendary/nile/sideload, partial gameSettings/appSettings schemas); `tsc --noEmit` clean; moduleStateCensus passes; prettier clean.

## Deviations from Plan

None. Note: `pnpm find-deadcode` not run and nothing pushed, as the plan directs (no production importer until 70-19/20/21).

## Self-Check: PASSED
