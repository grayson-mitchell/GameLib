---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 37
subsystem: downloads-ui
tags: [G21, download-hero, engine-label]
requires: [59-34, 59-36]
provides:
  - creating-bottle case in engineDownloadLabel (game page picks it up)
  - HeroPhase kind 'engine' for status engine-download
  - Downloads hero renders engine and bottle stage labels
key-files:
  modified:
    - src/frontend/hooks/engineDownloadLabel.ts
    - src/frontend/hooks/__tests__/engineDownloadLabel.test.ts
    - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
    - src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts
    - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
decisions:
  - "phaseLabel restructured to a switch; indeterminate bar and stat replacement already applied to any non-null phase."
metrics:
  completed: 2026-11-03
requirements: [G21]
---

# Phase 59 Plan 37: Engine and bottle stages in the Downloads hero Summary

The Downloads tab hero now names built-in engine stages and bottle creation instead of sitting at 0%.

## Commits
- Task 1: label + hero model + tests (4 new "G21: " tests)
- Task 2: DownloadHero index.tsx renders `engineDownloadLabel(p.context, t)`

## Verification
engineDownloadLabel and DownloadManager suites: 6 suites, 92 tests pass; eslint clean; prettier clean; `pnpm codecheck` passes.

## Deviations from Plan
None - plan executed as written.

## Known Stubs
None.

## Self-Check: PASSED
