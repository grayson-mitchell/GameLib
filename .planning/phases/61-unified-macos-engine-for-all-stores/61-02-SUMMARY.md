---
phase: 61-unified-macos-engine-for-all-stores
plan: 02
subsystem: macos-engine
tags: [refactor, move, engine]
requires: []
provides:
  - "Phase 59 engine layer at src/backend/engine/ (13 sources, 11 tests, fixtures), reachable by every store"
affects: [61-03, 61-04, 61-08, 61-10]
key-files:
  created: []
  modified:
    - src/backend/engine/ (moved from src/backend/storeManagers/steam/engine/)
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/storeManagers/steam/{bottle,games,gameInstall,gameLaunch,gameLaunchOverlay,gameBridgeLaunch,gameDrmLaunch,bottleProcessMonitor}.ts
    - src/common/types.ts
key-decisions:
  - "No re-export facade; all specifiers use the backend/engine/ alias"
requirements-completed: [D-19, D-13]
duration: n/a
completed: 2026-11-07
---

# Phase 61 Plan 02: Move engine layer to src/backend/engine Summary

Pure move of the Phase 59 engine layer to `src/backend/engine/` with every importer, `jest.mock`/`requireMock`/dynamic-import string and two stale comments repointed; no facade, no behaviour change. `steam/engine/` no longer exists.

## Commits

- e1bfdfe7c - git mv of sources, tests, fixtures; moved files' own imports repointed to `backend/storeManagers/steam/*`
- 15218239c - importers and mock specifiers repointed (13 files plus 2 comments)

## Verification

- `pnpm codecheck`, `pnpm boundaries`, `pnpm lint` exit 0 (lint: 0 errors).
- `jest src/backend/engine`: 247 passed.
- Broad run (engine + steam + sidecar): 6223 passed, 3 failed, all pre-existing (see below).
- games.test.ts after the move: 709 tests, 708 pass, 1 fail. The pre-move count was not separately recorded; the suite had no skipped or silently-unmocked change (4 `jest.mock('backend/engine/` specifiers present, zero old-path strings left in `src`).

## Deviations from Plan

**1. [Rule 3 - Blocking] prettier reflowed `require(...)` in engineState.ts**
- The longer alias specifier made prettier split `(require(...) as typeof import(...))`, detaching the `eslint-disable-next-line` and raising 2 `no-require-imports` lint errors.
- Fix: replaced with a `/* eslint-disable */ ... /* eslint-enable */` pair around the two expressions (prettier-stable). Behaviour identical.
- Also ran `prettier --write` over `src/backend/engine` (alias lines changed wrapping); and one extra comment in steamAuthFlowRegistration.ts:66 (`steam/engine/` -> `backend/engine/`) so the old-path grep gate is clean.

## Deferred Issues (pre-existing, identical at HEAD before this plan)

- `bottle.test.ts` "DRM_LAUNCH_FORM equals launch_form in 56-01-SUMMARY.md" and `games.test.ts` "channel constants equal the 56-01 SUMMARY values": read a Phase 56 SUMMARY file that is absent.
- `macArchKnownFixRouting.test.ts` "Intel: never seeds...": fails at base HEAD too.

## Known Stubs

None.

## Self-Check: PASSED
