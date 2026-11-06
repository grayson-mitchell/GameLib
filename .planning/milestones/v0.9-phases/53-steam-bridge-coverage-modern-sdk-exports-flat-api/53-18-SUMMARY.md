---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 18
subsystem: steam-bridge
tags: [census, helper-process, gap-closure]
requires: []
provides:
  - census CALL/NOVER/HELLO matching anchored to the helper payload category
  - rotation-spanning app-log segment
  - helper stdout/stderr relay that emits only complete lines
affects: [meta/bridgeCensus.ts, helperProcess.ts]
key-files:
  modified:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
decisions:
  - "classifyBridgeEvidence's no-HELLO gate also uses the anchored matcher (hasHello), not just the segment finder, so a forged HELLO cannot pass it"
metrics:
  completed: 2026-10-25
  tasks: 2
---

# Phase 53 Plan 18: Census anchoring, rotation and line carry-over Summary

Census evidence is now anchored to the helper's own `[ts] CATEGORY` payload, so game-supplied version strings can't forge CALL, NOVER or HELLO. It also spans gamelib.log rotation, and the helper stdout/stderr relay reassembles lines split across chunks.

## Commits
- 6789d13d9 fix(53-18): anchor census evidence to payload category; span log rotation (WR-01, WR-06)
- eeafd0fa3 fix(53-18): reassemble helper output lines across chunks (WR-05)

## What changed
- `meta/bridgeCensus.ts`: new `helloRegex` and `hasHello`. The CALL and NOVER regexes are anchored at `^\[ts\]\s+CATEGORY` on attributed payloads. `appLogSegmentFor` walks lines and keys only on a `bridge helper [appid]:` prefix whose payload is a HELLO. It then appends the text of all newer files in mtime order (WR-06).
- `helperProcess.ts`: `relayLines` keeps a per-stream carry string, passes only complete lines on, and flushes once on `end` (falling back to the child's `close`). It adds no timers or handles.
- Tests: 5 census tests (`53-18`) and 4 helperProcess tests (`53-18 WR-05`).

## Verification
- The bridgeCensus suite passes (99 tests) and the helperProcess suite passes (24).
- `pnpm bridge-census` still prints `9 of 18 Steamworks-using rows verified (majority: no)`, so no honest verdict changed.
- `pnpm codecheck` and prettier are clean.
- Neither unanchored form (`/\]\s+CALL`, `/\bNOVER\b/`) remains in `meta/bridgeCensus.ts`.

## Deviations from Plan
- **TDD ordering:** I wrote the census implementation before the tests, so I never saw them fail first. The tests pin the behavior, and the forged-string cases would not pass against the old unanchored regexes.
- **Test fix:** the LISTEN split test needed a mocked socket (`MockedSocket`/`FakeSocket`), as the other port tests do. This was a test-harness fix, not a product change.

## Self-Check: PASSED
