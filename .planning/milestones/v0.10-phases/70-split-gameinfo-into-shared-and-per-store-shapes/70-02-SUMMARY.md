---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 02
subsystem: tooling
tags: [ratchet, gameinfo, narrowing]
requires: []
provides:
  - meta/gameInfoNarrowingCeiling.cjs (countNarrowing, collectFiles, evaluate, parseArgs, staleExemptions, STORE_SPECIFIC_EXEMPT)
affects: [70-10]
key-files:
  created:
    - meta/gameInfoNarrowingCeiling.cjs
    - meta/__tests__/gameInfoNarrowingCeiling.test.ts
key-decisions:
  - "Tool built and tested with fixtures only; baseline frozen and CI wiring done in 70-10"
requirements-completed: [ARCH-03.2]
completed: 2026-11-14
---

# Phase 70 Plan 02: GameInfo narrowing ratchet Summary

Shrink-only D-15 ratchet tool (steamLineCeiling contract) with a TypeScript-AST counter for `isStoreGame`/`asStoreGame` calls and `*GameInfo` member identifiers, plus 21 unit and CLI tests.

## Measurements

- Scanned files on today's tree: 783. `DEFAULT_MIN_FILES` floor: 704 (90 percent, rounded down).
- All `STORE_SPECIFIC_EXEMPT` paths exist on disk (5 directories, 14 files for the `state/Steam*`, `helpers/steam*` and `consoleSteam*` families); none dropped.
- The tool without a baseline exits 1 naming `meta/gameInfoNarrowingBaseline.json`. No update flag exists.

## Commits

- 493343cc3: ratchet tool
- test commit follows it: unit and CLI tests (CLI spawn uses `createFakeHomeProfile()`)

## Verification

jest 21 pass; `fakeHomeIsolation` 7 pass; `tsc -p tsconfig.meta.json` clean; `pnpm find-deadcode` PASS; prettier clean on both files. Did not run full `pnpm lint`.

## Deviations from Plan

None. Not wired into lint.yml or pre-push by design (70-10).

## Known Stubs

None.

## Self-Check: PASSED
