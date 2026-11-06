---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 15
subsystem: steam-bridge
tags: [shimGenerate, steamstub, drmWrapper, withhold, gap-closure]
requires: []
provides:
  - "PlaceShimResult.drmWrapper 'steamstub'|'none' and exeArch on every stamped status incl. withheld"
  - "refresh-instead-of-withhold when a stale shim has no restorable original"
affects: [52-16]
tech-stack:
  added: []
  patterns: ["read-only probe before destructive restore"]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
key-decisions:
  - "Refresh, not refuse: no restorable original -> shim refreshed, placed-miss names gaps, warning advises Steam file verification"
  - "Persisted verdict schema stays ['steamstub']; 'none' only on the result"
requirements-completed: [P52-SCOPE-4]
duration: 25min
completed: 2026-10-24
---

# Phase 52 Plan 15: shimGenerate drmWrapper/exeArch and withhold guard Summary

Every stamped placeShimForGame result (withheld included) now reports a fresh `drmWrapper` ('steamstub'|'none') and `exeArch`, and the withhold guard only withholds when every in-scope GameLib shim can be restored from a valid backup; otherwise it refreshes the shim and returns a truthful placed-miss.

## Tasks

1. Fresh drmWrapper and exeArch on all stamped statuses - `42aa4aa09`
2. Withhold only when restorable, else refresh + placed-miss - `5547d87ec`

## Deviations from Plan

None in behaviour. Existing `toEqual` assertions on placed/already-placed results were extended with `drmWrapper: 'none', exeArch: null` to match the new explicit fields. The restore-failure test uses a read-only (0o444) target because `node:fs` cannot be spied in this suite.

## Known Stubs

None.

## Self-Check: PASSED

Commits 42aa4aa09 and 5547d87ec exist; bridge suite 446 tests pass; codecheck and prettier clean.
