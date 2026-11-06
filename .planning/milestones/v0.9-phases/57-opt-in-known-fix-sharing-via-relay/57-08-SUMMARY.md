---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 08
subsystem: sidecar
tags: [known-fixes, detectors, fire-and-forget, tdd]
requires: [57-04]
provides:
  - "Mach-O (add and contradicted-32 remove) and CEG detectors wired to reportDetectedFix"
affects: [57-12]
key-files:
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "CEG report sits before the forced-bridge early return so forced titles still report"
  - "No retry seam for Mach-O reports (D-18); early-return guard untouched"
metrics:
  completed: 2026-11-02
---

# Phase 57 Plan 08: Wire detectors to report client Summary

Three detectors now call the void-returning `reportDetectedFix` without awaiting: verdict '32' (macArch add, before promptI386Recovery), curated '32' contradicted by '64' (macArch remove), and CEG in persistBridgeDrmSignal (drm add, before the userRoute 'bridge' return; covers install and launch).

## Commits
- 9ba43c77c feat(57-08): Mach-O hooks in verifyMacArchGroundTruth
- b70c7d7af feat(57-08): CEG hook in persistBridgeDrmSignal

## Verification
- library.test.ts and games.test.ts: 858 tests pass (5 new library, 2 new games, assertions added to 3 existing CEG tests). Never-settling hook cases resolve.
- tsc clean; prettier clean; eslint reports no errors in the four touched files (`pnpm lint` exits 1 on 9 pre-existing errors in other files in the tests scope, out of scope).
- `pnpm build:sidecar` then `pnpm smoke:sidecar`: PASS (ready sentinel written, exit 0 on stdin EOF).

## Deviations from Plan
Source edits were made before tests rather than strictly test-first (hooks are one-line calls; the tests assert the call). `graphify update .` is run after the commit. Otherwise as written.

## Known Stubs
None.

## Self-Check: PASSED
